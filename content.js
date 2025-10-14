// SIGNATE Quest Auto Navigator - Content Script

class QuestNavigator {
  constructor() {
    this.isRunning = false;
    this.delay = 300; // デフォルト遅延時間（ミリ秒）
    this.aiHelper = new AIHelper();
    this.currentActivity = '待機中'; // 現在の動作状態
    this.setupMessageListener();
    this.log('QuestNavigator initialized');
    this.restoreState();
  }

  async restoreState() {
    // ページ遷移後も状態を復元
    const result = await chrome.storage.local.get(['isRunning', 'delay']);
    if (result.isRunning) {
      this.log('Restoring running state after page navigation');
      this.isRunning = true;
      if (result.delay) {
        this.delay = result.delay;
      }
      // 少し待ってから自動実行を再開
      setTimeout(() => {
        this.run();
      }, 1000);
    }
  }

  log(message, data = null) {
    console.log(`[QuestNavigator] ${message}`, data || '');
  }

  updateActivity(activity) {
    this.currentActivity = activity;
    console.log(`[Activity] ${activity}`);
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'start') {
        this.start();
        sendResponse({ status: 'started' });
      } else if (request.action === 'stop') {
        this.stop();
        sendResponse({ status: 'stopped' });
      } else if (request.action === 'getStatus') {
        sendResponse({ isRunning: this.isRunning, activity: this.currentActivity });
      } else if (request.action === 'getAiStatus') {
        sendResponse(this.aiHelper.getStatus());
      } else if (request.action === 'checkAiStatus') {
        this.aiHelper.checkApiStatus().then(result => {
          sendResponse({ success: result, ...this.aiHelper.getStatus() });
        });
        return true; // 非同期レスポンスを許可
      }
      return true;
    });
  }

  async start() {
    if (this.isRunning) {
      this.log('Already running');
      return;
    }
    this.isRunning = true;
    this.log('Starting auto navigation');

    // 状態を保存（ページ遷移後も継続するため）
    await chrome.storage.local.set({ isRunning: true });

    this.run();
  }

  async stop() {
    this.isRunning = false;
    this.log('Stopping auto navigation');

    // 状態を保存（ページ遷移後も停止を維持）
    await chrome.storage.local.set({ isRunning: false });
  }

  async run() {
    while (this.isRunning) {
      try {
        await this.processPage();
        await this.sleep(this.delay);
      } catch (error) {
        this.log('Error in run loop:', error);
        await this.sleep(this.delay);
      }
    }
  }

  async processPage() {
    this.log('Processing page...');
    this.updateActivity('ページを処理中...');

    // Step 1: 「クリア済みにする」ボタンをチェック
    if (await this.clickClearButton()) {
      this.log('Clicked clear button');
      this.updateActivity('「クリア済み」ボタンを押下');
      await this.sleep(1000);
      return;
    }

    // Step 1.5: コーディング問題かチェック
    if (this.isCodingQuestion()) {
      this.log('Coding question detected');
      this.updateActivity('コーディング問題を検出');
      if (await this.handleCodingQuestion()) {
        this.log('Handled coding question');
        await this.sleep(1000);
        return;
      }
      this.log('Coding question flow did not complete, falling back to general handling');
    }

    // Step 2: 問題文があるかチェック
    const questionHandled = await this.handleQuestion();
    if (questionHandled) {
      this.log('Handled question');
      this.updateActivity('問題に回答済み');

      // 採点ボタンが有効になるまで待つ（最大3回リトライ）
      for (let i = 0; i < 3; i++) {
        await this.sleep(500);
        if (await this.clickSubmitButton()) {
          this.log('Clicked submit button after answering');
          this.updateActivity('採点ボタンを押下');
          await this.sleep(2000);
          return;
        }
      }

      this.log('Submit button not found after answering, will retry on next loop');
      await this.sleep(500);
      return;
    }

    // Step 3: 「採点する」ボタンをチェック（問題がない場合）
    const submitClicked = await this.clickSubmitButton();
    if (submitClicked) {
      this.log('Clicked submit button');
      this.updateActivity('採点ボタンを押下');
      await this.sleep(1500); // 採点結果を待つ

      // 不正解かチェック
      if (this.checkIfIncorrect()) {
        this.log('Answer was incorrect, trying with hint');
        this.updateActivity('不正解 - ヒントを確認中');
        if (await this.handleIncorrectAnswer()) {
          return;
        }
      }

      // 採点後、次へ進むボタンが表示されるまで待つ（最大5回リトライ）
      for (let i = 0; i < 5; i++) {
        await this.sleep(800);
        if (await this.clickNextButton()) {
          this.log('Clicked next button after submit');
          await this.sleep(2000);
          return;
        }
      }

      this.log('Next button not found after submit, will retry on next loop');
      await this.sleep(1000);
      return;
    }

    // Step 4: 「次へ進む」ボタンをチェック
    if (await this.clickNextButton()) {
      this.log('Clicked next button');
      this.updateActivity('「次へ進む」ボタンを押下');
      await this.sleep(2000);
      return;
    }

    this.log('No action taken on this page');
    this.updateActivity('待機中');
  }

  async clickClearButton() {
    // 既存のセレクタでの検索
    const clearButton = document.querySelector('#movie-button-clear a, .p-movie-button-clear a');
    if (clearButton && this.isVisible(clearButton)) {
      this.log('Found clear button (by selector):', clearButton.textContent.trim());
      clearButton.click();
      return true;
    }

    // SVGアイコン（fa-right-left）を含むリンクを検索
    const svgClearLinks = document.querySelectorAll('a svg.fa-right-left');
    for (const svg of svgClearLinks) {
      const link = svg.closest('a');
      if (link && this.isVisible(link)) {
        const linkText = link.textContent.trim();
        if (linkText.includes('クリア済み') || linkText.includes('クリア')) {
          this.log('Found clear button (by SVG icon):', linkText);
          link.click();
          return true;
        }
      }
    }

    // テキストベースで「クリア済みにする」を検索
    const allLinks = document.querySelectorAll('a');
    for (const link of allLinks) {
      const text = link.textContent.trim();
      if ((text.includes('クリア済みにする') || text.includes('クリア済み')) && this.isVisible(link)) {
        this.log('Found clear button (by text):', text);
        link.click();
        return true;
      }
    }

    return false;
  }

  async clickNextButton() {
    // クラス名ベースの検索
    const selectors = [
      'a.for-next',
      'a.tips-modal-btn-next',
      'a.tips-modal-btn',
      '.tips-modal-btn-next',
      'button.next-button',
      'a[class*="next"]'
    ];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (this.isVisible(element)) {
            this.log(`Found next button (by selector: ${selector}):`, element.textContent.trim());
            element.click();
            return true;
          }
        }
      } catch (e) {
        // セレクタがサポートされていない場合はスキップ
      }
    }

    // テキストベースの検索（a タグ）
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const text = link.textContent.trim();
      if ((text.includes('次へ進む') || text.includes('次へ') || text === '進む') && this.isVisible(link)) {
        this.log('Found next button (by text in a):', text);
        link.click();
        return true;
      }
    }

    // テキストベースの検索（button タグ）
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
      const text = button.textContent.trim();
      if ((text.includes('次へ進む') || text.includes('次へ') || text === '進む') && this.isVisible(button)) {
        this.log('Found next button (by text in button):', text);
        button.click();
        return true;
      }
    }

    // SVGアイコン付きのリンクを検索（a タグ内の SVG）
    const svgLinks = document.querySelectorAll('a svg.fa-arrow-right');
    for (const svg of svgLinks) {
      const link = svg.closest('a');
      if (link && this.isVisible(link)) {
        this.log('Found next button (by arrow icon in a):', link.textContent.trim());
        link.click();
        return true;
      }
    }

    // SVGアイコン付きの div.c-next-button を検索
    const svgDivs = document.querySelectorAll('div.c-next-button svg.fa-arrow-right');
    for (const svg of svgDivs) {
      const div = svg.closest('div.c-next-button');
      if (div && this.isVisible(div)) {
        this.log('Found next button (by arrow icon in div.c-next-button):', div.textContent.trim());
        div.click();
        return true;
      }
    }

    // テキストベースで div を検索
    const divs = document.querySelectorAll('div');
    for (const div of divs) {
      const text = div.textContent.trim();
      if ((text.includes('次へ進む') || text.includes('次へ') || text === '進む') && this.isVisible(div)) {
        // クリック可能な div かチェック（cursor: pointer など）
        const style = window.getComputedStyle(div);
        if (style.cursor === 'pointer' || div.onclick || div.classList.contains('c-next-button')) {
          this.log('Found next button (by text in clickable div):', text);
          div.click();
          return true;
        }
      }
    }

    // デバッグ: すべてのリンクを表示
    if (links.length > 0) {
      this.log('Available links on page:', Array.from(links).slice(0, 5).map(l => l.textContent.trim()));
    }

    return false;
  }

  async extractImagesFromQuestion() {
    this.log('Extracting images from question...');
    const images = [];

    // 問題文エリア内の画像を検索
    const questionAreas = document.querySelectorAll('.p-block-instructions-inner, .instruction-sentence-list, .markdown-body');

    for (const area of questionAreas) {
      const imgElements = area.querySelectorAll('img');

      for (const img of imgElements) {
        const src = img.src;
        if (src && src.startsWith('http')) {
          this.log('Found image:', src);

          try {
            const imageData = await this.fetchImageAsBase64(img);
            if (imageData) {
              images.push(imageData);
              this.log('✓ Successfully converted image to base64');
            }
          } catch (error) {
            this.log('✗ Failed to convert image:', error.message);
          }
        }
      }
    }

    this.log(`Extracted ${images.length} images`);
    return images;
  }

  async fetchImageAsBase64(imgElement) {
    try {
      this.log('Fetching image via background script:', imgElement.src);

      // background scriptを使って画像を取得
      const response = await chrome.runtime.sendMessage({
        action: 'fetchImage',
        url: imgElement.src
      });

      if (response && response.success) {
        this.log('✓ Successfully fetched image from background script');
        return {
          data: response.data,
          mimeType: response.mimeType
        };
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      this.log('Error fetching image:', error);
      return null;
    }
  }

  async handleQuestion() {
    // 問題文エリアを検出
    const questionArea = document.querySelector('.p-block-instructions-inner, .instruction-sentence-list');
    if (!questionArea) {
      return false;
    }

    // 選択肢を取得
    const choices = this.extractChoices();
    if (choices.length === 0) {
      return false;
    }

    // 既に回答済みかチェック
    const alreadyAnswered = choices.some(choice => choice.element.checked);
    if (alreadyAnswered) {
      this.log('Question already answered, skipping');
      return false;
    }

    this.log('Question detected');

    // 問題文を取得
    const questionText = this.extractQuestionText();
    this.log('Question:', questionText);
    this.log('Choices:', choices);

    const questionType = choices[0].type;
    this.log(`Question type: ${questionType}`);

    // 画像を抽出
    const images = await this.extractImagesFromQuestion();

    // AIに問題を送って回答を取得
    this.updateActivity('AI (Gemini) に問い合わせ中...');
    const answerResult = await this.aiHelper.answerQuestion(questionText, choices, questionType, images);
    this.log(`AI selected answer:`, answerResult);
    this.updateActivity('AIから回答を取得');

    // 回答タイプに応じて処理
    if (questionType === 'radio') {
      // 単一選択: answerResult は単一のインデックス
      await this.selectAnswer(choices, answerResult);
    } else if (questionType === 'checkbox') {
      // 複数選択: answerResult は配列
      await this.selectMultipleAnswers(choices, answerResult);
    }
    return true;
  }

  extractQuestionText() {
    const questionElements = document.querySelectorAll('.instruction-sentence, .markdown-body');
    let questionText = '';

    for (const elem of questionElements) {
      questionText += elem.textContent.trim() + '\n';
    }

    return questionText.trim();
  }

  extractChoices() {
    const choices = [];

    // ラジオボタンの場合
    const radioInputs = document.querySelectorAll('input[type="radio"]');
    if (radioInputs.length > 0) {
      radioInputs.forEach((input, index) => {
        const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
        const text = label ? label.textContent.trim() : '';
        choices.push({
          type: 'radio',
          element: input,
          text: text,
          index: index
        });
      });
      return choices;
    }

    // チェックボックスの場合
    const checkboxInputs = document.querySelectorAll('input[type="checkbox"]:not(.p-hint-button)');
    if (checkboxInputs.length > 0) {
      checkboxInputs.forEach((input, index) => {
        const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
        const text = label ? label.textContent.trim() : '';
        choices.push({
          type: 'checkbox',
          element: input,
          text: text,
          index: index
        });
      });
      return choices;
    }

    return choices;
  }

  async selectAnswer(choices, answerIndex) {
    if (answerIndex >= 0 && answerIndex < choices.length) {
      const choice = choices[answerIndex];
      if (!choice.element.checked) {
        choice.element.click();
        this.log(`Selected choice ${answerIndex}: ${choice.text}`);
      }
    }
  }

  async selectMultipleAnswers(choices, answerIndices) {
    // answerIndices は配列であることを想定
    if (!Array.isArray(answerIndices)) {
      answerIndices = [answerIndices];
    }

    for (const index of answerIndices) {
      if (index >= 0 && index < choices.length) {
        const choice = choices[index];
        if (!choice.element.checked) {
          choice.element.click();
          this.log(`Selected choice ${index}: ${choice.text}`);
          await this.sleep(200); // 各選択の間に少し遅延
        }
      }
    }
  }

  async clickSubmitButton() {
    // 「採点する」ボタンを探す
    // 複数のセレクタパターンを試す
    const selectors = [
      'button.select-submit-btn',
      'button.qfc-a-qfc-button.select-submit-btn',
      '.choice-button-area button',
      'button[type="button"]'
    ];

    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        const buttonText = button.textContent.trim();
        if (buttonText.includes('採点する') && !button.disabled && this.isVisible(button)) {
          this.log('Found submit button:', buttonText);
          button.click();
          return true;
        }
      }
    }

    // より広範囲に検索
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const buttonText = button.textContent.trim();
      if (buttonText.includes('採点する') && !button.disabled && this.isVisible(button)) {
        this.log('Found submit button (fallback):', buttonText);
        button.click();
        return true;
      }
    }

    return false;
  }

  checkIfIncorrect() {
    this.log('Checking if answer is incorrect...');

    // まず不正解メッセージを明示的に探す（最優先）
    const incorrectMessages = [
      '不正解',
      '選択されていません',
      '不正解です'
    ];

    const pageText = document.body.textContent;
    const hasIncorrectMessage = incorrectMessages.some(msg => pageText.includes(msg));

    if (hasIncorrectMessage) {
      this.log('✗ Found incorrect message - answer is incorrect');
      return true; // 不正解メッセージがあるので不正解
    }

    // 次に「正解」メッセージを探す
    const correctMessages = [
      '正解',
      '正解です',
      '正解！'
    ];

    const hasCorrectMessage = correctMessages.some(msg => pageText.includes(msg));

    if (hasCorrectMessage) {
      this.log('✓ Found correct message - answer is correct');
      return false; // 正解メッセージがあるので正解
    }

    // 「次へ進む」ボタンが表示されているかチェック
    const nextButtonSelectors = [
      'a.for-next',
      'a.tips-modal-btn-next',
      'a.tips-modal-btn',
      '.tips-modal-btn-next'
    ];

    for (const selector of nextButtonSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (this.isVisible(element)) {
            this.log('✓ Next button is visible - answer is likely correct');
            return false; // 次へ進むボタンがあるので正解の可能性が高い
          }
        }
      } catch (e) {
        // セレクタエラーは無視
      }
    }

    // テキストベースで「次へ進む」を検索
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const text = link.textContent.trim();
      if ((text.includes('次へ進む') || text.includes('次へ')) && this.isVisible(link)) {
        this.log('✓ Next button with text is visible - answer is likely correct');
        return false; // 次へ進むボタンがあるので正解の可能性が高い
      }
    }

    // どちらのメッセージも見つからない場合は、採点結果待ちの可能性があるため
    // 保守的に「不正解ではない」と判断
    this.log('⚠ No clear correct/incorrect indication found - assuming not incorrect');
    return false;
  }

  async handleIncorrectAnswer() {
    this.log('Handling incorrect answer with hint');

    // ヒントタブを開く
    const hintOpened = await this.openHintTab();
    if (!hintOpened) {
      this.log('Could not open hint tab');
      return false;
    }

    await this.sleep(500);

    // ヒントを抽出
    const hintText = this.extractHint();
    this.log('Extracted hint:', hintText);

    if (!hintText) {
      this.log('No hint found');
      return false;
    }

    // 問題文を再取得
    const questionText = this.extractQuestionText();

    // 選択肢を取得
    const choices = this.extractChoices();
    if (choices.length === 0) {
      return false;
    }

    // 現在の選択をクリア
    await this.clearSelections(choices);

    const questionType = choices[0].type;

    // ヒント付きでAIに再度問い合わせ
    const answerResult = await this.aiHelper.answerQuestionWithHint(questionText, choices, questionType, hintText);
    this.log('AI selected answer with hint:', answerResult);

    // 回答を選択
    if (questionType === 'radio') {
      await this.selectAnswer(choices, answerResult);
    } else if (questionType === 'checkbox') {
      await this.selectMultipleAnswers(choices, answerResult);
    }

    await this.sleep(500);

    // 再度採点
    if (await this.clickSubmitButton()) {
      this.log('Re-submitted answer with hint');
      await this.sleep(2000);
      return true;
    }

    return false;
  }

  async openHintTab() {
    // ヒントのチェックボックスを探す
    const hintCheckbox = document.querySelector('#hint-check, input.p-hint-button, input[id*="hint"]');
    if (hintCheckbox && !hintCheckbox.checked) {
      this.log('Opening hint tab');
      hintCheckbox.click();
      return true;
    }

    // ヒントのラベルを探す
    const hintLabel = document.querySelector('.p-hint-label, label[for="hint-check"]');
    if (hintLabel) {
      this.log('Clicking hint label');
      hintLabel.click();
      return true;
    }

    return false;
  }

  extractHint() {
    // ヒントエリアを探す
    const hintSelectors = [
      '.p-hint-content',
      '.hint-content',
      '.tab-content-wrapper',
      '[class*="hint"]',
      '[class*="operation-check"]',
      '[class*="check-message"]',
      '.quiz-guidance'
    ];

    const collected = new Set();

    for (const selector of hintSelectors) {
      const hintElements = document.querySelectorAll(selector);
      for (const hintElement of hintElements) {
        if (!hintElement || !this.isVisible(hintElement)) {
          continue;
        }
        const hintText = hintElement.textContent.trim();
        if (hintText && hintText.length > 0) {
          collected.add(hintText);
        }
      }
    }

    if (collected.size === 0) {
      const fallbackKeywords = ['出力をしていますか', '想定の出力結果', '使用していますか', '呼び出していますか', '確認しましょう'];
      const candidateElements = document.querySelectorAll('div, p, li, span');

      for (const elem of candidateElements) {
        if (!this.isVisible(elem)) {
          continue;
        }

        const text = elem.textContent.trim();
        if (!text || text.length < 4 || text.length > 400) {
          continue;
        }

        if (fallbackKeywords.some(keyword => text.includes(keyword))) {
          collected.add(text);
        }
      }
    }

    if (collected.size === 0) {
      return null;
    }

    return Array.from(collected).join('\n');
  }

  async clearSelections(choices) {
    // すべての選択を解除
    for (const choice of choices) {
      if (choice.element.checked) {
        choice.element.click();
        await this.sleep(100);
      }
    }
  }

  isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== コーディング問題の処理 ==========

  isCodingQuestion() {
    this.log('Checking if this is a coding question...');

    // 1. 最も確実な方法: .ace_editor クラスの存在をチェック
    const aceEditor = document.querySelector('.ace_editor');
    if (aceEditor) {
      this.log(`✓ Ace Editor detected (.ace_editor found):`, {
        id: aceEditor.id,
        className: aceEditor.className
      });
      return true;
    }

    // 2. 特定のエディターIDをチェック
    const operationEditor = document.querySelector('#operation-editor');
    if (operationEditor) {
      this.log('✓ Operation Editor detected (#operation-editor found)');
      return true;
    }

    // 3. p-editor-operation クラスをチェック
    const pEditorOperation = document.querySelector('.p-editor-operation');
    if (pEditorOperation) {
      this.log('✓ Editor detected (.p-editor-operation found)');
      return true;
    }

    // 4. その他のセレクタ
    const aceSelectors = [
      '.ace_content',
      '#editor.ace_editor',
      'pre#editor',
      '[id*="editor"]'
    ];

    for (const selector of aceSelectors) {
      const elem = document.querySelector(selector);
      if (elem && elem.classList && (elem.classList.contains('ace_editor') || elem.classList.contains('p-editor-operation'))) {
        this.log(`✓ Editor detected with selector: ${selector}`);
        return true;
      }
    }

    this.log('✗ No coding question detected');
    return false;
  }

  async handleCodingQuestion() {
    try {
      // 1. 問題文を取得
      const questionText = this.extractQuestionText();
      this.log('Question text:', questionText);

      // 2. Ace Editorからコードを取得
      const code = this.getAceEditorContent();
      if (!code) {
        this.log('Could not get code from Ace Editor');
        return false;
      }
      this.log('Original code:', code);

      // 3. 穴埋め箇所（____）が存在するかチェック
      const blanks = (code.match(/____/g) || []).length;
      if (blanks === 0) {
        this.log('No blanks found in code, skipping');
        return false;
      }

      let completedCode = code;
      const descriptionText = this.extractCodingDescriptionText();
      this.log('Description text for coding question:', descriptionText);
      let hintText = null;
      try {
        const hintOpened = await this.openHintTab();
        if (hintOpened) {
          await this.sleep(300);
        }
      } catch (e) {
        this.log('Hint tab open error (ignored):', e);
      }
      hintText = this.extractHint();
      this.log('Hint text for coding question:', hintText);

      const codingRequirements = this.extractCodingRequirements(questionText, hintText);
      this.log('Coding requirements derived from hint:', codingRequirements);

      let usedGemini = false;
      let lastMissingRequirements = [];
      let extraInstructions = '';

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          this.updateActivity('AI (Gemini Pro) でコード補完中...');
          const aiCompleted = await this.aiHelper.completeCodingQuestion(
            questionText,
            code,
            descriptionText,
            hintText,
            extraInstructions
          );
          this.log('Gemini completion result:', aiCompleted);
          if (typeof aiCompleted === 'string') {
            const normalized = aiCompleted.trim();
            if (normalized && normalized !== code && !normalized.includes('____')) {
              completedCode = normalized;
              usedGemini = true;
              this.log('Completed code by Gemini:', completedCode);
            }
          }
        } catch (error) {
          this.log('Gemini completion failed, fallback to heuristic fill');
          this.log('Gemini completion error details:', error);
          usedGemini = false;
          break;
        }

        if (!usedGemini) {
          break;
        }

        lastMissingRequirements = this.findMissingRequirements(completedCode, codingRequirements);
        if (lastMissingRequirements.length === 0) {
          break;
        }

        extraInstructions = this.buildRequirementInstruction(lastMissingRequirements);
        this.log('Requirements missing after Gemini completion, retrying with extra instructions:', extraInstructions);
      }

      if (!usedGemini) {
        const fillValues = this.getCodingFillValues(
          code,
          questionText,
          blanks,
          descriptionText,
          hintText,
          codingRequirements
        );
        this.log('Derived fill values (fallback):', fillValues);

        if (fillValues.length !== blanks || fillValues.some(value => !value)) {
          this.log('Could not derive all fill values, skipping coding question');
          return false;
        }

        for (const value of fillValues) {
          completedCode = completedCode.replace('____', value);
        }
        this.log('Completed code by fallback:', completedCode);

        if (completedCode.includes('____')) {
          this.log('Completed code still contains blanks, aborting coding question handling');
          return false;
        }
      } else if (lastMissingRequirements.length > 0) {
        completedCode = this.appendRequirementStatements(completedCode, lastMissingRequirements);
        this.log('Appended missing requirement statements after Gemini attempt:', lastMissingRequirements);
      }

      const remainingRequirements = this.findMissingRequirements(completedCode, codingRequirements);
      if (remainingRequirements.length > 0) {
        completedCode = this.appendRequirementStatements(completedCode, remainingRequirements);
        this.log('Final requirement enforcement added statements:', remainingRequirements);
      }

      // 5. Ace Editorにコードを入力
      this.updateActivity('エディタにコードを入力中...');
      if (!(await this.setAceEditorContent(completedCode))) {
        this.log('Failed to set code in Ace Editor');
        return false;
      }

      await this.sleep(500);

      // 6. 実行ボタンを押す
      this.updateActivity('コードを実行中...');
      const executeClicked = await this.clickExecuteButton();
      if (!executeClicked) {
        this.log('Execute button not found or not clickable, continuing without manual execution');
      } else {
        this.updateActivity('実行結果を待機中...');
      }

      // 実行結果を待つ（最大10回）
      let result = null;
      if (executeClicked) {
        for (let i = 0; i < 10; i++) {
          await this.sleep(1000);
          result = this.getExecutionResult();
          if (result) {
            break;
          }
        }
      }

      // 7. 実行結果を取得
      this.log('Execution result:', result);
      this.updateActivity('実行結果を解析中');

      const executionIssues = this.validateCodingExecution(result || '', codingRequirements);
      if (executionIssues.length > 0) {
        this.log('Execution validation issues detected:', executionIssues);
        this.updateActivity(`実行結果に未達の可能性: ${executionIssues[0]}`);
      }

      // 8. 選択肢を取得
      const finalChoices = this.extractChoices();

      if (finalChoices.length === 0) {
        this.log('No choices available - assuming auto-graded coding question');
        this.updateActivity('コードを採点中...');
        await this.sleep(500);

        if (await this.clickSubmitButton()) {
          this.log('Submitted code for auto-grading');
          this.updateActivity('採点ボタンを押下');
          await this.sleep(2000);

          if (this.checkIfIncorrect()) {
            this.log('Auto-graded coding submission was incorrect, stopping');
            this.updateActivity('不正解 - 停止中');
            return false;
          }

          this.log('Auto-graded coding submission succeeded');
          return true;
        }

        this.log('Submit button not found for auto-graded coding question');
        return false;
      }

      const questionType = finalChoices[0].type;

      // 画像を抽出（コーディング問題でも画像がある場合に対応）
      const images = await this.extractImagesFromQuestion();

      // 9. AIに実行結果と選択肢を送って答えを選ばせる
      if (!result) {
        this.log('No execution result obtained, asking AI without result');
        this.updateActivity('AI (Gemini) に問い合わせ中...');

        const fallbackAnswer = await this.aiHelper.answerQuestion(questionText, finalChoices, questionType, images);
        this.log('AI answer (without execution result):', fallbackAnswer);

        if (questionType === 'radio') {
          await this.selectAnswer(finalChoices, fallbackAnswer);
        } else {
          await this.selectMultipleAnswers(finalChoices, fallbackAnswer);
        }
      } else {
        // 実行結果がある場合はAIに実行結果も含めて送信
        this.log('Asking AI to select answer based on execution result');
        this.updateActivity('AI (Gemini) に実行結果を送信中...');

        // 問題文 + 実行結果を組み合わせて新しい問題文として送る
        const enrichedQuestion = `${questionText}\n\n【実行結果】\n${result}`;

        const aiAnswer = await this.aiHelper.answerQuestion(enrichedQuestion, finalChoices, questionType, images);
        this.log('AI answer (with execution result):', aiAnswer);

        if (questionType === 'radio') {
          await this.selectAnswer(finalChoices, aiAnswer);
        } else {
          await this.selectMultipleAnswers(finalChoices, aiAnswer);
        }
      }

      await this.sleep(500);
      if (await this.clickSubmitButton()) {
        this.log('Submitted answer after AI selection');
        this.updateActivity('採点ボタンを押下');
        await this.sleep(2000);

        // 不正解かチェック
        if (this.checkIfIncorrect()) {
          this.log('Coding answer was incorrect, stopping');
          this.updateActivity('不正解 - 停止中');
          return false; // 不正解の場合は処理を停止
        }

        // 正解の場合のみページ遷移を続行
        this.log('Coding answer was correct');
        return true;
      }

      return false;
    } catch (error) {
      this.log('Error handling coding question:', error);
      return false;
    }
  }

  getCodingFillValues(code, questionText, blankCount, providedDescriptionText = null, providedHintText = null, requirements = []) {
    const blankContexts = this.extractBlanksFromCode(code);
    const descriptionText = providedDescriptionText ?? this.extractCodingDescriptionText();
    const hintText = providedHintText ?? this.extractHint();
    const methodCandidates = this.extractMethodMappingFromDescription(descriptionText);
    const referenceText = `${questionText || ''}\n${descriptionText || ''}\n${hintText || ''}`;
    const libraryAlias = this.extractLibraryAlias(referenceText);
    const moduleKeywords = this.extractModuleKeywords(referenceText);

    this.log('Method candidates:', methodCandidates);
    this.log('Library alias:', libraryAlias);
    this.log('Module keywords:', moduleKeywords);

    const fillValues = [];
    const lineUsage = new Map();

    for (const blank of blankContexts) {
      let selected = null;
      const lineKey = `${blank.lineIndex}:${blank.line.trim()}`;
      const blankIndex = lineUsage.get(lineKey) || 0;

      selected = this.getRequirementValueForBlank(blank, requirements, blankIndex);

      selected = this.guessFillValueFromContext(
        blank,
        libraryAlias,
        moduleKeywords,
        referenceText
      );

      if (!selected && blank.comment) {
        const match = methodCandidates.find(item => !item.used && item.keyword && blank.comment.includes(item.keyword));
        if (match) {
          selected = match.method;
          match.used = true;
        }
      }

      if (!selected && questionText) {
        const match = methodCandidates.find(item => !item.used && item.keyword && questionText.includes(item.keyword));
        if (match) {
          selected = match.method;
          match.used = true;
        }
      }

      if (!selected) {
        const unused = methodCandidates.find(item => !item.used);
        if (unused) {
          selected = unused.method;
          unused.used = true;
        }
      }

      if (!selected) {
        selected = this.guessMethodFromText(blank.comment || questionText || hintText || '');
      }

      fillValues.push(selected);
      lineUsage.set(lineKey, blankIndex + 1);
    }

    // 候補が不足している場合は残りを推測
    while (fillValues.length < blankCount) {
      fillValues.push(this.guessMethodFromText(questionText || hintText || ''));
    }

    return fillValues;
  }

  extractCodingRequirements(questionText, hintText) {
    const requirements = new Set();
    const sourceText = `${questionText || ''}\n${hintText || ''}`;
    if (!sourceText.trim()) {
      return [];
    }

    const backtickRegex = /`([^`]+)`/g;
    let match;
    while ((match = backtickRegex.exec(sourceText)) !== null) {
      const snippet = match[1].trim();
      if (snippet.length > 0 && snippet.length <= 160) {
        requirements.add(snippet);
      }
    }

    const printRegex = /print\([^\)\n]+\)/g;
    while ((match = printRegex.exec(sourceText)) !== null) {
      const snippet = match[0].trim();
      if (snippet.length > 0 && snippet.length <= 160) {
        requirements.add(snippet);
      }
    }

    const arrayAssignRegex = /[A-Za-z_][\w]*\s*=\s*np\.array\([^\)\n]+\)/g;
    while ((match = arrayAssignRegex.exec(sourceText)) !== null) {
      const snippet = match[0].trim();
      if (snippet.length > 0 && snippet.length <= 160) {
        requirements.add(snippet);
      }
    }

    if (/NumPy配列化/.test(sourceText) || /NumPy配列/.test(sourceText)) {
      if (![...requirements].some(req => req.includes('np.array'))) {
        requirements.add('train_imgs_np = np.array(train_imgs)');
        requirements.add('print(type(train_imgs_np), train_imgs_np.shape)');
      }
    }

    const matrixMatch = sourceText.match(/(\d+)\s*行\s*(\d+)\s*列/);
    if (matrixMatch) {
      const rows = parseInt(matrixMatch[1], 10);
      const cols = parseInt(matrixMatch[2], 10);
      const subplotStatement = `plt.subplot(${rows}, ${cols}, i + 1)`;
      requirements.add(subplotStatement);
    }

    if (/imshow/.test(sourceText) && /train_imgs/.test(sourceText)) {
      requirements.add('plt.imshow(train_imgs[i])');
    }

    if (/plt\.show/.test(sourceText) || /可視化/.test(sourceText) || /表示/.test(sourceText)) {
      requirements.add('plt.show()');
    }

    return Array.from(requirements);
  }

  findMissingRequirements(code, requirements) {
    if (!requirements || requirements.length === 0) {
      return [];
    }

    const normalizedCode = this.normalizeCodeForComparison(code);
    const missing = [];

    for (const requirement of requirements) {
      const normalizedRequirement = this.normalizeCodeForComparison(requirement);
      if (!normalizedRequirement) {
        continue;
      }
      if (!normalizedCode.includes(normalizedRequirement)) {
        missing.push(requirement);
      }
    }

    return missing;
  }

  buildRequirementInstruction(missingRequirements) {
    if (!missingRequirements || missingRequirements.length === 0) {
      return '';
    }

    return missingRequirements
      .map(req => `- コード内に「${req}」を含め、指示どおりの出力が得られるようにしてください`)
      .join('\n');
  }

  appendRequirementStatements(code, requirementStatements) {
    if (!requirementStatements || requirementStatements.length === 0) {
      return code;
    }

    let adjustedCode = code;
    for (const statement of requirementStatements) {
      if (!statement || statement.length === 0) {
        continue;
      }
      const normalizedStatement = this.normalizeCodeForComparison(statement);
      if (!normalizedStatement) {
        continue;
      }
      if (this.normalizeCodeForComparison(adjustedCode).includes(normalizedStatement)) {
        continue;
      }
      const existingLineRegex = new RegExp(`(^\\s*)(?:${this.escapeRegex(statement.split('(')[0].trim())})\\s*\\([^\\)]*\\)`, 'm');
      const placeholderRegex = new RegExp(`(^\\s*)(?:${this.escapeRegex(statement.split('(')[0].trim())})\\s*\\([^\\n\\r\\)]*____[^\\)]*\\)`, 'm');
      let replaced = false;

      const regexes = [placeholderRegex, existingLineRegex];
      for (const regex of regexes) {
        const match = adjustedCode.match(regex);
        if (match) {
          const indent = match[1] || '';
          adjustedCode = adjustedCode.replace(regex, `${indent}${statement}`);
          replaced = true;
          break;
        }
      }

      if (replaced) {
        continue;
      }

      adjustedCode = `${adjustedCode.trimEnd()}\n${statement}\n`;
    }

    return adjustedCode;
  }

  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  normalizeCodeForComparison(text) {
    if (!text) {
      return '';
    }

    return text
      .replace(/#.*$/gm, '')
      .replace(/\s+/g, '')
      .trim();
  }

  validateCodingExecution(resultText, requirements) {
    const issues = [];

    if (!resultText || resultText.trim().length === 0) {
      issues.push('実行結果が取得できませんでした');
      return issues;
    }

    if (/Traceback|Error|Exception/i.test(resultText)) {
      issues.push('実行中にエラーが発生しています');
    }

    if (requirements && requirements.some(req => req.includes('print(type('))) {
      if (!resultText.includes('<class')) {
        issues.push('type() の出力が確認できません');
      }
    }

    if (requirements && requirements.some(req => req.includes('.shape'))) {
      if (!/\(\s*\d+(?:\s*,\s*\d+)+\s*\)/.test(resultText)) {
        issues.push('shape の出力が確認できません');
      }
    }

    if (requirements && requirements.some(req => req.includes('np.array'))) {
      if (!/ndarray/i.test(resultText) && !/numpy/i.test(resultText)) {
        issues.push('NumPy配列化の結果が確認できません');
      }
    }

    if (requirements && requirements.some(req => req.includes('plt.subplot'))) {
      if (!/plt\.subplot\(\s*2\s*,\s*5/i.test(resultText)) {
        issues.push('subplot の行列指定 (2,5) が確認できません');
      }
    }

    if (requirements && requirements.some(req => req.includes('plt.imshow'))) {
      if (!/plt\.imshow/i.test(resultText)) {
        issues.push('imshow による画像表示が確認できません');
      }
    }

    return issues;
  }

  extractCodingDescriptionText() {
    const selectors = [
      '#description-area',
      '.p-tab-content-description',
      '.p-block-description-inner',
      '.qfc-m-operation-description-area',
      '.markdown-body'
    ];

    const texts = [];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      if (nodes.length > 0) {
        nodes.forEach(node => {
          const text = node.textContent;
          if (text) {
            texts.push(text.trim());
          }
        });
      }
    }

    return texts.join('\n');
  }

  extractMethodMappingFromDescription(descriptionText) {
    if (!descriptionText) {
      return [];
    }

    const lines = descriptionText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const mapping = [];
    for (const line of lines) {
      const bulletMatch = line.match(/^・\s*([^：:]+)[：:](.*)$/);
      if (bulletMatch) {
        const keyword = bulletMatch[1].trim();
        const methodMatch = bulletMatch[2].match(/\.\s*([a-zA-Z_][\w]*)\s*\(\)/);
        if (methodMatch) {
          const methodName = methodMatch[1].trim();
          mapping.push({
            keyword,
            method: `${methodName}()`,
            used: false
          });
          continue;
        }
      }

      const methodOnly = line.match(/([a-zA-Z_][\w]*)\s*\(\)/);
      if (methodOnly) {
        const methodName = methodOnly[1].trim();
        mapping.push({
          keyword: '',
          method: `${methodName}()`,
          used: false
        });
      }
    }

    return mapping;
  }

  getRequirementValueForBlank(blank, requirements, position) {
    if (!requirements || requirements.length === 0) {
      return null;
    }

    for (const requirement of requirements) {
      const funcMatch = requirement.match(/^([A-Za-z_][\w.]*)\s*\((.*)\)$/);
      if (!funcMatch) {
        continue;
      }

      const funcName = funcMatch[1];
      if (!blank.line.includes(funcName)) {
        continue;
      }

      const args = this.splitArguments(funcMatch[2]);
      if (position < args.length) {
        return args[position];
      }
    }

    return null;
  }

  splitArguments(argumentText) {
    return argumentText
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }

  extractBlanksFromCode(code) {
    const lines = code.split('\n');
    const blanks = [];
    let lastComment = '';

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        lastComment = trimmed.replace(/^#\s*/, '');
      }

      let searchIndex = 0;
      while (true) {
        const blankPos = line.indexOf('____', searchIndex);
        if (blankPos === -1) {
          break;
        }

        const before = line.slice(0, blankPos);
        const after = line.slice(blankPos + 4);

        blanks.push({
          line,
          comment: lastComment,
          lineIndex,
          before,
          after
        });

        searchIndex = blankPos + 4;
      }
    }

    return blanks;
  }

  extractLibraryAlias(text) {
    if (!text) {
      return null;
    }

    const aliasPattern = /([A-Za-z0-9._-]+)\s*(?:は|を)\s*([A-Za-z0-9._-]+)\s*と記述/;
    const match = text.match(aliasPattern);
    if (match) {
      const alias = match[2];
      this.log('Found library alias via pattern:', match[0]);
      return alias;
    }

    const libraryPattern = /ライブラリ(?:の|は)?\s*([A-Za-z0-9._-]+)/;
    const libMatch = text.match(libraryPattern);
    if (libMatch) {
      const library = libMatch[1];
      this.log('Found library via pattern:', libMatch[0]);
      return library;
    }

    const commonLibraries = ['skimage', 'numpy', 'pandas', 'matplotlib', 'sklearn', 'tensorflow', 'torch'];
    for (const lib of commonLibraries) {
      if (text.includes(lib)) {
        this.log('Found library via fallback keyword:', lib);
        return lib;
      }
    }

    return null;
  }

  extractModuleKeywords(text) {
    if (!text) {
      return [];
    }

    const modulePattern = /([A-Za-z0-9_]+)\s*[:：]/g;
    const modules = new Set();
    let match;
    while ((match = modulePattern.exec(text)) !== null) {
      modules.add(match[1]);
    }

    const directKeywords = ['io', 'transform', 'filters', 'color', 'data', 'stats'];
    for (const keyword of directKeywords) {
      if (text.includes(keyword)) {
        modules.add(keyword);
      }
    }

    return Array.from(modules);
  }

  guessFillValueFromContext(blank, libraryAlias, moduleKeywords, referenceText) {
    if (!blank) {
      return null;
    }

    const comment = blank.comment || '';
    const beforeTrimmed = (blank.before || '').trim();

    if (beforeTrimmed.endsWith('from')) {
      if (libraryAlias) {
        return libraryAlias;
      }

      const libraryMatch = comment.match(/([A-Za-z0-9._-]+)\s*(?:ライブラリ|library)/i);
      if (libraryMatch) {
        return libraryMatch[1];
      }
    }

    if (beforeTrimmed.includes('import')) {
      for (const keyword of moduleKeywords) {
        if (comment.includes(keyword) || referenceText.includes(`${keyword}モジュール`)) {
          return keyword;
        }
      }

      const directKeyword = comment.match(/([A-Za-z0-9_]+)/);
      if (directKeyword) {
        return directKeyword[1];
      }
    }

    const cjkMatch = comment.match(/[A-Za-z0-9_]+/g);
    if (cjkMatch && cjkMatch.length > 0) {
      return cjkMatch[0];
    }

    return null;
  }

  guessMethodFromText(text) {
    if (!text) {
      return null;
    }

    if (/(ユニーク数|unique count|件数|種類)/i.test(text)) {
      return 'nunique()';
    }

    if (/(ユニークな要素|unique|一覧)/i.test(text)) {
      return 'unique()';
    }

    if (/(合計|sum)/i.test(text)) {
      return 'sum()';
    }

    if (/(平均|mean)/i.test(text)) {
      return 'mean()';
    }

    if (/(中央値|median)/i.test(text)) {
      return 'median()';
    }

    if (/(最小|min)/i.test(text)) {
      return 'min()';
    }

    if (/(最大|max)/i.test(text)) {
      return 'max()';
    }

    if (/(標準偏差|std)/i.test(text)) {
      return 'std()';
    }

    return null;
  }

  extractAnswerFromResultText(resultText, questionText) {
    if (!resultText) {
      return null;
    }

    const lines = resultText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    for (const line of lines) {
      if (/(数|count|合計|total|件数)/i.test(line)) {
        const numberMatch = line.match(/-?\d+(\.\d+)?/);
        if (numberMatch) {
          return numberMatch[0];
        }
      }
    }

    if (questionText) {
      for (const line of lines) {
        if (line.includes(questionText)) {
          const numberMatch = line.match(/-?\d+(\.\d+)?/);
          if (numberMatch) {
            return numberMatch[0];
          }
        }
      }
    }

    const defaultMatch = resultText.match(/-?\d+(\.\d+)?/);
    if (defaultMatch) {
      return defaultMatch[0];
    }

    return lines.length > 0 ? lines[0] : null;
  }

  getAceEditorContent() {
    this.log('Attempting to get Ace Editor content...');

    // まず、エディターインスタンスの取得を試みる（最優先）
    this.cacheEditorInstance();

    if (this.editorInstance && this.editorInstance.getValue) {
      try {
        const cached = this.editorInstance.getValue();
        if (cached && typeof cached === 'string') {
          this.log('✓ Got content from cached editor instance');
          return cached;
        }
      } catch (e) {
        this.log('Cached editor instance getValue failed:', e.message);
      }
    }

    // 方法1: グローバルaceオブジェクトから取得
    if (typeof ace !== 'undefined' && ace.edit) {
      this.log('✓ Found global ace object');

      // ace.edit() で直接エディターを取得
      try {
        const editor = ace.edit('operation-editor');
        if (editor) {
          const content = editor.getValue();
          this.log('✓ Got content from ace.edit("operation-editor"):', content.substring(0, 50) + '...');
          // エディターインスタンスを保存（後で使う）
          this.editorInstance = editor;
          return content;
        }
      } catch (e) {
        this.log('Could not get editor via ace.edit("operation-editor"):', e.message);
      }

      try {
        const aceElement = document.querySelector('.ace_editor');
        if (aceElement) {
          const editor = ace.edit(aceElement);
          if (editor) {
            const content = editor.getValue();
            this.log('✓ Got content from ace.edit(element) via global ace');
            this.editorInstance = editor;
            return content;
          }
        }
      } catch (e) {
        this.log('Could not get editor via ace.edit(element):', e.message);
      }
    }

    // 方法2: テキストレイヤーから直接取得（読み取り専用）
    const textLayer = document.querySelector('.ace_text-layer');
    if (textLayer) {
      const lines = textLayer.querySelectorAll('.ace_line');
      if (lines.length > 0) {
        const content = Array.from(lines)
          .map(line => line.textContent.replace(/\u00a0/g, ' '))
          .join('\n');
        this.log('✓ Got content from .ace_text-layer (line-based):', content.substring(0, 50) + '...');
        return content;
      }

      const fallbackContent = textLayer.textContent.replace(/\u00a0/g, ' ');
      this.log('✓ Got content from .ace_text-layer (fallback):', fallbackContent.substring(0, 50) + '...');
      return fallbackContent;
    }

    // 方法3: #operation-editor から取得
    const operationEditor = document.querySelector('#operation-editor');
    if (operationEditor) {
      this.log('Found #operation-editor');
      if (operationEditor.env && operationEditor.env.editor) {
        const content = operationEditor.env.editor.getValue();
        this.log('✓ Got content from #operation-editor.env.editor');
        this.editorInstance = operationEditor.env.editor;
        return content;
      }
    }

    // 方法4: DOM要素から取得 (.ace_editor クラス)
    const aceElements = document.querySelectorAll('.ace_editor');
    this.log(`Found ${aceElements.length} .ace_editor elements`);
    for (const elem of aceElements) {
      if (elem.env && elem.env.editor) {
        const content = elem.env.editor.getValue();
        this.log('✓ Got content from .ace_editor element');
        this.editorInstance = elem.env.editor;
        return content;
      }
    }

    this.log('✗ Could not find any editor content');
    return null;
  }

  cacheEditorInstance() {
    // エディターインスタンスをキャッシュする専用メソッド
    if (this.editorInstance) {
      return; // 既にキャッシュ済み
    }

    this.log('Attempting to cache editor instance...');

    // 方法1: ace.edit() で取得
    if (typeof ace !== 'undefined' && ace.edit) {
      try {
        const editor = ace.edit('operation-editor');
        if (editor && editor.getValue) {
          this.editorInstance = editor;
          this.log('✓ Cached editor instance via ace.edit("operation-editor")');
          return;
        }
      } catch (e) {
        // エラーは無視（他の方法を試す）
      }

      try {
        const aceElement = document.querySelector('.ace_editor');
        if (aceElement) {
          const editor = ace.edit(aceElement);
          if (editor && editor.getValue) {
            this.editorInstance = editor;
            this.log('✓ Cached editor instance via ace.edit(element)');
            return;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 方法2: DOM要素から取得
    const operationEditor = document.querySelector('#operation-editor');
    if (operationEditor && operationEditor.env && operationEditor.env.editor) {
      this.editorInstance = operationEditor.env.editor;
      this.log('✓ Cached editor instance via #operation-editor.env.editor');
      return;
    }

    // 方法3: .ace_editor クラスから取得
    const aceElements = document.querySelectorAll('.ace_editor');
    for (const elem of aceElements) {
      if (elem.env && elem.env.editor) {
        this.editorInstance = elem.env.editor;
        this.log('✓ Cached editor instance via .ace_editor element');
        return;
      }
    }

    this.log('✗ Could not cache editor instance');
  }

  async setAceEditorContent(code) {
    this.log('Attempting to set Ace Editor content...');

    // 方法0: chrome.scripting 経由でページコンテキストを操作
    try {
      this.log('Trying scripting API injection...');
      const success = await this.setEditorContentViaScripting(code);
      if (success) {
        this.log('✓ Set content via scripting API');
        return true;
      }
      this.log('Scripting API injection did not succeed, falling back');
    } catch (e) {
      this.log('✗ Scripting API injection failed:', e.message);
    }

    // まず、キャッシュを試みる（まだキャッシュされていない場合）
    if (!this.editorInstance) {
      this.log('No cached instance, attempting to cache...');
      this.cacheEditorInstance();
    }

    // 方法1: キャッシュされたエディターインスタンスを使用
    if (this.editorInstance) {
      this.log('Using cached editor instance');
      try {
        this.editorInstance.setValue(code, -1); // -1 でカーソルを先頭に
        this.log('✓ Set content via cached editor instance');
        return true;
      } catch (e) {
        this.log('✗ Failed to set via cached instance:', e.message);
        this.editorInstance = null; // キャッシュをクリア
      }
    }

    // 方法2: #operation-editor から設定
    const operationEditor = document.querySelector('#operation-editor');
    if (operationEditor) {
      this.log('Found #operation-editor element');
      if (operationEditor.env && operationEditor.env.editor) {
        try {
          operationEditor.env.editor.setValue(code, -1);
          this.log('✓ Set content via #operation-editor.env.editor');
          this.editorInstance = operationEditor.env.editor;
          return true;
        } catch (e) {
          this.log('✗ Failed via #operation-editor.env.editor:', e.message);
        }
      } else {
        this.log('✗ #operation-editor.env.editor not found');
      }
    } else {
      this.log('✗ #operation-editor element not found');
    }

    // 方法3: DOM要素から設定 (.ace_editor クラス)
    const aceElements = document.querySelectorAll('.ace_editor');
    this.log(`Found ${aceElements.length} .ace_editor elements`);
    for (const elem of aceElements) {
      if (elem.env && elem.env.editor) {
        try {
          elem.env.editor.setValue(code, -1);
          this.log('✓ Set content via .ace_editor element');
          this.editorInstance = elem.env.editor;
          return true;
        } catch (e) {
          this.log('✗ Failed via .ace_editor element:', e.message);
        }
      } else if (typeof ace !== 'undefined' && ace.edit) {
        try {
          const editor = ace.edit(elem);
          if (editor && editor.setValue) {
            editor.setValue(code, -1);
            this.log('✓ Set content via ace.edit(elem) fallback');
            this.editorInstance = editor;
            return true;
          }
        } catch (e) {
          this.log('✗ Failed via ace.edit(elem) fallback:', e.message);
        }
      } else {
        this.log('✗ .ace_editor element has no env.editor');
      }
    }

    this.log('✗ Could not set editor content - all methods failed');
    return false;
  }

  setEditorContentViaScripting(code) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        resolve(false);
        return;
      }

      chrome.runtime.sendMessage({ action: 'setAceEditorContent', code }, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        if (!response) {
          resolve(false);
          return;
        }

        resolve(!!response.success);
      });
    });
  }

  async clickExecuteButton() {
    this.log('Looking for execute button...');

    // 方法1: SVGアイコン (fa-laptop-code) を含むボタンを検索
    const svgButtons = document.querySelectorAll('button svg.fa-laptop-code');
    if (svgButtons.length > 0) {
      this.log(`Found ${svgButtons.length} buttons with fa-laptop-code icon`);
      for (const svg of svgButtons) {
        const button = svg.closest('button');
        if (button && this.isVisible(button)) {
          this.log('✓ Found and clicking execute button (by SVG icon fa-laptop-code)');
          button.click();
          return true;
        }
      }
    }

    // 方法2: クラス名で検索 (qfc-a-qfc-button)
    const qfcButtons = document.querySelectorAll('button.qfc-a-qfc-button.outline');
    if (qfcButtons.length > 0) {
      this.log(`Found ${qfcButtons.length} buttons with class qfc-a-qfc-button.outline`);
      for (const button of qfcButtons) {
        if (this.isVisible(button)) {
          this.log('✓ Found and clicking execute button (by class qfc-a-qfc-button.outline)');
          button.click();
          return true;
        }
      }
    }

    // 方法3: テキストベースの検索（フォールバック）
    const buttonTexts = ['試す', '実行', 'Run', 'Execute'];
    const buttons = document.querySelectorAll('button, a, input[type="button"]');
    this.log(`Found ${buttons.length} potential buttons for text search`);

    for (const button of buttons) {
      const text = button.textContent.trim();
      if (buttonTexts.some(btnText => text.includes(btnText))) {
        if (this.isVisible(button)) {
          this.log('✓ Found and clicking execute button (by text):', text);
          button.click();
          return true;
        } else {
          this.log('✗ Found execute button but not visible:', text);
        }
      }
    }

    this.log('✗ No execute button found');
    return false;
  }

  getExecutionResult() {
    this.log('Attempting to get execution result...');

    // 実行結果エリアを探す
    const selectors = [
      '.execution-result',
      '.output',
      '.result',
      '[class*="result"]',
      '[class*="output"]'
    ];

    // デバッグ: 各セレクタで見つかった要素の数と状態を表示
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        this.log(`Found ${elements.length} elements for selector "${selector}"`);
        for (const elem of elements) {
          const visible = this.isVisible(elem);
          const text = elem.textContent.trim();
          if (text.length > 0) {
            this.log(`  Element visible: ${visible}, text preview: "${text.slice(0, 50)}..."`);
            if (visible) {
              this.log('✓ Returning result from selector:', selector);
              return text;
            }
          }
        }
      }
    }

    // #code-console-zone をチェック
    const consoleZone = document.querySelector('#code-console-zone');
    if (consoleZone) {
      this.log('Found #code-console-zone');
      const zoneText = consoleZone.innerText.trim();
      const isVisible = this.isVisible(consoleZone);
      this.log(`  #code-console-zone visible: ${isVisible}, text length: ${zoneText.length}`);
      if (zoneText) {
        this.log('✓ Console zone text preview:', zoneText.slice(0, 120));
        return zoneText;
      }
    } else {
      this.log('✗ #code-console-zone not found');
    }

    // <pre> 要素をチェック
    const preElements = document.querySelectorAll('#code-area pre, #code-console-zone pre, pre');
    this.log(`Found ${preElements.length} <pre> elements`);

    // 最初の3個をプレビュー
    const prePreview = Array.from(preElements).slice(0, 3).map(pre => ({
      text: pre.textContent.trim().slice(0, 30),
      visible: this.isVisible(pre),
      parent: pre.parentElement?.className || 'no-parent'
    }));
    this.log('<pre> elements preview:', prePreview);

    for (const pre of preElements) {
      const text = pre.textContent.trim();
      if (text && this.isVisible(pre)) {
        this.log('✓ Found text in visible <pre> element:', text.slice(0, 120));
        return text;
      }
    }

    this.log('✗ No execution result found');
    return null;
  }

  findMatchingChoice(choices, answer) {
    // 答えと一致する選択肢を探す
    const answerStr = String(answer).trim();

    for (let i = 0; i < choices.length; i++) {
      const choiceText = choices[i].text.trim();
      if (choiceText === answerStr || choiceText.includes(answerStr)) {
        return i;
      }
    }

    // 数値の場合は、近い値を探す
    const answerNum = parseFloat(answerStr);
    if (!isNaN(answerNum)) {
      for (let i = 0; i < choices.length; i++) {
        const choiceNum = parseFloat(choices[i].text);
        if (!isNaN(choiceNum) && Math.abs(choiceNum - answerNum) < 0.01) {
          return i;
        }
      }
    }

    return -1;
  }
}

// インスタンス化
const navigator = new QuestNavigator();

// ページ読み込み完了時のログ
window.addEventListener('load', () => {
  console.log('[QuestNavigator] Page loaded, ready to start');
});
