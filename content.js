// SIGNATE Quest Auto Navigator - Content Script

class QuestNavigator {
  constructor() {
    this.isRunning = false;
    this.delay = 300; // デフォルト遅延時間（ミリ秒）
    this.aiHelper = new AIHelper();
    this.setupMessageListener();
    this.log('QuestNavigator initialized');
  }

  log(message, data = null) {
    console.log(`[QuestNavigator] ${message}`, data || '');
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
        sendResponse({ isRunning: this.isRunning });
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

  start() {
    if (this.isRunning) {
      this.log('Already running');
      return;
    }
    this.isRunning = true;
    this.log('Starting auto navigation');
    this.run();
  }

  stop() {
    this.isRunning = false;
    this.log('Stopping auto navigation');
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

    // Step 1: 「クリア済みにする」ボタンをチェック
    if (await this.clickClearButton()) {
      this.log('Clicked clear button');
      await this.sleep(1000);
      return;
    }

    // Step 2: 問題文があるかチェック
    const questionHandled = await this.handleQuestion();
    if (questionHandled) {
      this.log('Handled question');

      // 採点ボタンが有効になるまで待つ（最大3回リトライ）
      for (let i = 0; i < 3; i++) {
        await this.sleep(500);
        if (await this.clickSubmitButton()) {
          this.log('Clicked submit button after answering');
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
      await this.sleep(1500); // 採点結果を待つ

      // 不正解かチェック
      if (await this.checkIfIncorrect()) {
        this.log('Answer was incorrect, trying with hint');
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
      await this.sleep(2000);
      return;
    }

    this.log('No action taken on this page');
  }

  async clickClearButton() {
    const clearButton = document.querySelector('#movie-button-clear a, .p-movie-button-clear a');
    if (clearButton) {
      clearButton.click();
      return true;
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

    // SVGアイコン付きのリンクを検索
    const svgLinks = document.querySelectorAll('a svg.fa-arrow-right');
    for (const svg of svgLinks) {
      const link = svg.closest('a');
      if (link && this.isVisible(link)) {
        this.log('Found next button (by arrow icon):', link.textContent.trim());
        link.click();
        return true;
      }
    }

    // デバッグ: すべてのリンクを表示
    if (links.length > 0) {
      this.log('Available links on page:', Array.from(links).slice(0, 5).map(l => l.textContent.trim()));
    }

    return false;
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

    // AIに問題を送って回答を取得
    const answerResult = await this.aiHelper.answerQuestion(questionText, choices, questionType);
    this.log(`AI selected answer:`, answerResult);

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
    // 不正解を示すメッセージを探す
    const incorrectMessages = [
      '不正解',
      '選択されていません',
      '思い出せない場合',
      'ヒントを見てみましょう'
    ];

    const pageText = document.body.textContent;
    return incorrectMessages.some(msg => pageText.includes(msg));
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
      '[class*="hint"]'
    ];

    for (const selector of hintSelectors) {
      const hintElement = document.querySelector(selector);
      if (hintElement && this.isVisible(hintElement)) {
        const hintText = hintElement.textContent.trim();
        if (hintText && hintText.length > 0) {
          return hintText;
        }
      }
    }

    return null;
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
}

// インスタンス化
const navigator = new QuestNavigator();

// ページ読み込み完了時のログ
window.addEventListener('load', () => {
  console.log('[QuestNavigator] Page loaded, ready to start');
});
