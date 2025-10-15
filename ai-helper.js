// AI Helper for question answering

class AIHelper {
  constructor() {
    this.apiKey = null;
    this.isAvailable = false;
    this.statusMessage = '未設定';
    this.modelName = 'gemini-2.5-flash';
    this.codingModelName = 'gemini-2.5-pro';
    this.loadApiKey();
  }

  async loadApiKey() {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    this.apiKey = result.geminiApiKey || null;

    if (this.apiKey) {
      await this.checkApiStatus();
    } else {
      this.isAvailable = false;
      this.statusMessage = 'API Key未設定';
    }
  }

  async saveApiKey(apiKey) {
    await chrome.storage.local.set({ geminiApiKey: apiKey });
    this.apiKey = apiKey;

    if (apiKey) {
      await this.checkApiStatus();
    } else {
      this.isAvailable = false;
      this.statusMessage = 'API Key未設定';
    }
  }

  async checkApiStatus() {
    if (!this.apiKey) {
      this.isAvailable = false;
      this.statusMessage = 'API Key未設定';
      return false;
    }

    try {
      const url = this.getApiEndpoint();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
      body: JSON.stringify(this.buildRequestPayload('test', 10))
      });

      if (response.ok) {
        this.isAvailable = true;
        this.statusMessage = '利用可能';
        console.log('[AIHelper] Gemini API is available');
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        this.isAvailable = false;
        this.statusMessage = `エラー: ${response.status} - ${errorData.error?.message || 'Unknown error'}`;
        console.error('[AIHelper] API check failed:', response.status, errorData);
        return false;
      }
    } catch (error) {
      this.isAvailable = false;
      this.statusMessage = `接続エラー: ${error.message}`;
      console.error('[AIHelper] API check error:', error);
      return false;
    }
  }

  getStatus() {
    return {
      isAvailable: this.isAvailable,
      message: this.statusMessage,
      hasApiKey: !!this.apiKey
    };
  }

  async answerQuestion(questionText, choices, questionType = 'radio', images = []) {
    if (!this.apiKey) {
      console.log('[AIHelper] No API key configured, using fallback');
      return this.fallbackAnswer(questionText, choices, questionType);
    }

    try {
      const prompt = this.buildPrompt(questionText, choices, questionType);
      const answer = await this.queryGemini(prompt, {
        modelName: this.modelName,
        maxOutputTokens: 4096,
        images: images
      });
      return this.parseAnswer(answer, choices, questionType);
    } catch (error) {
      console.error('[AIHelper] Error querying AI:', error);
      return this.fallbackAnswer(questionText, choices, questionType);
    }
  }

  async answerQuestionWithHint(questionText, choices, questionType = 'radio', hintText = '') {
    if (!this.apiKey) {
      console.log('[AIHelper] No API key configured, using fallback');
      return this.fallbackAnswer(questionText, choices, questionType);
    }

    try {
      const prompt = this.buildPromptWithHint(questionText, choices, questionType, hintText);
      const answer = await this.queryGemini(prompt, {
        modelName: this.codingModelName,
        maxOutputTokens: 4096
      });
      return this.parseAnswer(answer, choices, questionType);
    } catch (error) {
      console.error('[AIHelper] Error querying AI with hint:', error);
      return this.fallbackAnswer(questionText, choices, questionType);
    }
  }

  buildPrompt(questionText, choices, questionType) {
    let prompt = '';

    if (questionType === 'radio') {
      // 単一選択の場合
      prompt = `以下の問題に回答してください。正解の選択肢の番号（1から始まる）を1つだけ返してください。\n\n`;
      prompt += `問題文:\n${questionText}\n\n`;
      prompt += `選択肢:\n`;
      choices.forEach((choice, index) => {
        prompt += `${index + 1}. ${choice.text}\n`;
      });
      prompt += `\n正解の番号を1つだけ返してください（例: 3）`;
    } else if (questionType === 'checkbox') {
      // 複数選択の場合
      prompt = `以下の問題に回答してください。正解の選択肢の番号（1から始まる）をすべて返してください。\n\n`;
      prompt += `問題文:\n${questionText}\n\n`;
      prompt += `選択肢:\n`;
      choices.forEach((choice, index) => {
        prompt += `${index + 1}. ${choice.text}\n`;
      });
      prompt += `\n正解の番号をカンマ区切りで返してください（例: 1,3,4）。単一の場合は1つだけ返してください（例: 2）`;
    }

    return prompt;
  }

  buildPromptWithHint(questionText, choices, questionType, hintText) {
    let prompt = '';

    if (questionType === 'radio') {
      // 単一選択の場合
      prompt = `以下の問題に回答してください。正解の選択肢の番号（1から始まる）を1つだけ返してください。\n\n`;
      prompt += `問題文:\n${questionText}\n\n`;
      prompt += `ヒント:\n${hintText}\n\n`;
      prompt += `選択肢:\n`;
      choices.forEach((choice, index) => {
        prompt += `${index + 1}. ${choice.text}\n`;
      });
      prompt += `\nヒントを参考に、正解の番号を1つだけ返してください（例: 3）`;
    } else if (questionType === 'checkbox') {
      // 複数選択の場合
      prompt = `以下の問題に回答してください。正解の選択肢の番号（1から始まる）をすべて返してください。\n\n`;
      prompt += `問題文:\n${questionText}\n\n`;
      prompt += `ヒント:\n${hintText}\n\n`;
      prompt += `選択肢:\n`;
      choices.forEach((choice, index) => {
        prompt += `${index + 1}. ${choice.text}\n`;
      });
      prompt += `\nヒントを参考に、正解の番号をカンマ区切りで返してください（例: 1,3,4）。単一の場合は1つだけ返してください（例: 2）`;
    }

    return prompt;
  }

  async queryGemini(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    let modelName = null;
    let maxOutputTokens = 2048;
    let images = [];

    if (typeof options === 'string') {
      modelName = options;
    } else if (options && typeof options === 'object') {
      if (typeof options.modelName === 'string') {
        modelName = options.modelName;
      }
      if (typeof options.maxOutputTokens === 'number') {
        maxOutputTokens = options.maxOutputTokens;
      }
      if (Array.isArray(options.images)) {
        images = options.images;
      }
    }

    const selectedModel = modelName || this.modelName;
    const url = this.getApiEndpoint(selectedModel);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(this.buildRequestPayload(prompt, maxOutputTokens, images))
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('[AIHelper] API response:', JSON.stringify(data, null, 2));

    if (Array.isArray(data.candidates)) {
      for (const candidate of data.candidates) {
        const text = this.extractTextFromCandidate(candidate);
        if (text) {
          return text;
        }
      }
    }

    if (data.promptFeedback?.blockReason) {
      throw new Error(`No textual content returned (block reason: ${data.promptFeedback.blockReason})`);
    }

    console.warn('[AIHelper] No textual content in response', JSON.stringify(data, null, 2));
    throw new Error('No textual content returned from API');
  }

  extractTextFromCandidate(candidate) {
    if (!candidate) {
      return '';
    }

    const segments = [];
    const content = candidate.content;

    if (Array.isArray(content?.parts)) {
      for (const part of content.parts) {
        if (typeof part?.text === 'string') {
          segments.push(part.text);
        }
      }
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === 'string') {
          segments.push(part.text);
        } else if (typeof part === 'string') {
          segments.push(part);
        }
      }
    }

    if (typeof content?.text === 'string') {
      segments.push(content.text);
    }

    if (typeof candidate.output === 'string') {
      segments.push(candidate.output);
    }

    if (typeof candidate.text === 'string') {
      segments.push(candidate.text);
    }

    return segments
      .map(segment => segment.trim())
      .filter(Boolean)
      .join('\n');
  }

  buildRequestPayload(text, maxOutputTokens = 200, images = []) {
    const parts = [{ text }];

    // 画像がある場合は追加
    if (Array.isArray(images) && images.length > 0) {
      for (const image of images) {
        if (image.data && image.mimeType) {
          parts.push({
            inline_data: {
              mime_type: image.mimeType,
              data: image.data
            }
          });
        }
      }
    }

    return {
      contents: [{
        role: 'user',
        parts
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens,
        responseMimeType: 'text/plain'
      }
    };
  }

  getApiEndpoint(modelName = this.modelName) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  }

  parseAnswer(answer, choices, questionType) {
    console.log('[AIHelper] Parsing answer, type:', questionType);
    console.log('[AIHelper] Raw answer:', answer);

    // 回答の最後の行から答えを抽出（本文中の数字を除外するため）
    const lines = answer.trim().split('\n').filter(line => line.trim().length > 0);
    const lastLine = lines[lines.length - 1];
    console.log('[AIHelper] Last line for parsing:', lastLine);

    if (questionType === 'radio') {
      // 単一選択: 最後の行から最初の数字を抽出
      const match = lastLine.match(/\d+/);
      if (match) {
        const answerIndex = parseInt(match[0]) - 1; // 1-indexed to 0-indexed
        if (answerIndex >= 0 && answerIndex < choices.length) {
          console.log('[AIHelper] ✓ Parsed radio answer:', answerIndex);
          return answerIndex;
        }
      }

      // パースに失敗した場合はフォールバック
      console.log('[AIHelper] ✗ Failed to parse radio answer, using fallback');
      return this.fallbackAnswer(null, choices, questionType);
    } else if (questionType === 'checkbox') {
      // 複数選択: 最後の行からカンマ区切りまたは複数の数字を抽出
      const numbers = lastLine.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const indices = numbers
          .map(n => parseInt(n) - 1) // 1-indexed to 0-indexed
          .filter(i => i >= 0 && i < choices.length);

        if (indices.length > 0) {
          console.log('[AIHelper] ✓ Parsed checkbox answer:', indices);
          return indices;
        }
      }

      // パースに失敗した場合はフォールバック
      console.log('[AIHelper] ✗ Failed to parse checkbox answer, using fallback');
      return this.fallbackAnswer(null, choices, questionType);
    }

    return this.fallbackAnswer(null, choices, questionType);
  }

  fallbackAnswer(questionText, choices, questionType = 'radio') {
    // フォールバック: キーワードベースの簡易判定
    // または最初の選択肢を返す

    if (questionText) {
      // キーワードマッチングを試みる
      const keywords = ['正しい', '適切', '最も'];

      for (let i = 0; i < choices.length; i++) {
        const choiceText = choices[i].text.toLowerCase();

        // 「最も〜」「正しい」などのキーワードを含む選択肢を優先
        if (keywords.some(keyword => choiceText.includes(keyword))) {
          if (questionType === 'radio') {
            return i;
          } else {
            return [i]; // 複数選択の場合は配列で返す
          }
        }
      }
    }

    // デフォルト: 最初の選択肢
    if (questionType === 'radio') {
      return 0;
    } else {
      return [0]; // 複数選択の場合は配列で返す
    }
  }

  // ========== コーディング問題用のメソッド ==========

  async completeCodingQuestion(questionText, code, descriptionText = '', hintText = '', extraInstructions = '') {
    if (!this.apiKey) {
      console.log('[AIHelper] No API key configured for coding question');
      return code; // そのまま返す
    }

    try {
      const prompt = this.buildCodingPrompt(questionText, code, descriptionText, hintText, extraInstructions);
      const answer = await this.queryGemini(prompt, {
        modelName: this.codingModelName,
        maxOutputTokens: 6144
      });
      return this.extractCompletedCode(answer, code);
    } catch (error) {
      console.error('[AIHelper] Error completing coding question:', error);
      return code; // エラー時はそのまま返す
    }
  }

  buildCodingPrompt(questionText, code, descriptionText = '', hintText = '', extraInstructions = '') {
    let prompt = `以下のPythonコードの穴埋め問題に回答してください。\n\n`;
    prompt += `問題文:\n${questionText}\n\n`;
    if (descriptionText) {
      prompt += `参考情報:\n${descriptionText}\n\n`;
    }
    if (hintText) {
      prompt += `ヒント:\n${hintText}\n\n`;
    }
    if (extraInstructions) {
      prompt += `必須要件:\n${extraInstructions}\n\n`;
    }
    prompt += `コード（____の部分を埋めてください）:\n${code}\n\n`;
    prompt += `指示:\n`;
    prompt += `- 元のコードの構造とインデントを維持し、____ のみ適切なPythonのコードに置き換えてください\n`;
    prompt += `- ____ の部分以外のコード（インポート、コメント、空行を含む）を削除・省略・変更しないでください\n`;
    prompt += `- 既存の下線（____）は必ず指定された内容で置き換え、置換しない場合でも削除しないでください\n`;
    prompt += `- ____ の部分に入るコードのみを考え、不要な追加行を挿入しないでください\n`;
    prompt += `- 完成したコード全体を返してください（元の行順を維持すること）\n`;
    prompt += `- コードブロック（\`\`\`）は使わず、コードのみを返してください\n`;
    return prompt;
  }

  extractCompletedCode(answer, originalCode) {
    console.log('[AIHelper] Extracting completed code from AI response...');
    console.log('[AIHelper] AI response:', answer.substring(0, 200));

    // AIの回答からコードを抽出
    let code = answer.trim();

    // ```python や ``` で囲まれている場合は除去
    code = code.replace(/```python\n?/g, '');
    code = code.replace(/```\n?/g, '');
    code = code.trim();

    // 改行を正規化
    code = code.replace(/\r\n/g, '\n');

    // もしAIから完全なコードが返却され、____が残っていない場合はそのまま採用
    const hasStructureKeyword = /\b(from|import|def|class|return|for|while)\b/.test(code);
    const hasComment = code.includes('#');
    const lineCount = code.split('\n').filter(line => line.trim().length > 0).length;
    if (!code.includes('____') && (hasStructureKeyword || hasComment || lineCount >= 2)) {
      console.log('[AIHelper] ✓ Using AI code as-is (complete code returned)');
      return code;
    }

    // AIが____の部分だけを返した場合（穴埋めの内容だけ）
    // 例: "nunique, unique" や "nunique()\nunique()" など
    if (!/\b(from|import|def|class)\b/.test(code)) {
      console.log('[AIHelper] AI returned only fill-in content, replacing ____ in original code');

      // カンマ区切りまたは改行で分割
      let fillIns = [];
      if (code.includes(',')) {
        // カンマ区切りの場合
        fillIns = code.split(',').map(s => s.trim()).filter(s => s.length > 0);
      } else if (code.includes('\n')) {
        // 改行区切りの場合
        fillIns = code.split('\n').map(s => s.trim()).filter(s => s.length > 0 && !s.includes('____'));
      } else {
        // 単一の値の場合
        fillIns = [code];
      }

      console.log('[AIHelper] Fill-in values:', fillIns);

      let modifiedCode = originalCode;
      for (const fillIn of fillIns) {
        // ____を1つずつ置換
        modifiedCode = modifiedCode.replace('____', fillIn);
      }

      return modifiedCode;
    }

    console.log('[AIHelper] ✗ Could not extract code, returning original');
    return originalCode;
  }

  rebuildUsingOriginalStructure(originalCode, aiCode) {
    try {
      if (!originalCode.includes('____')) {
        return null;
      }

      const placeholderToken = '__AI_PLACEHOLDER__';
      const replaced = originalCode.replace(/____/g, placeholderToken);
      const escaped = replaced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const whitespaceFlexible = escaped.replace(/\s+/g, '\\s*');
      const pattern = whitespaceFlexible.replace(new RegExp(placeholderToken, 'g'), '([\\s\\S]+?)');
      const regex = new RegExp(`^${pattern}$`);

      const match = aiCode.match(regex);
      if (!match) {
        console.log('[AIHelper] Could not match AI code to template when rebuilding');
        return null;
      }

      const fillValues = match.slice(1).map(value => value.trim());
      let rebuilt = originalCode;
      for (const fill of fillValues) {
        rebuilt = rebuilt.replace('____', fill);
      }
      return rebuilt;
    } catch (error) {
      console.error('[AIHelper] Failed to rebuild code structure:', error);
      return null;
    }
  }

  async deriveAnswerFromResult(questionText, executionResult) {
    if (!this.apiKey) {
      console.log('[AIHelper] No API key configured for deriving answer');
      return null;
    }

    try {
      const prompt = this.buildAnswerDerivationPrompt(questionText, executionResult);
      const answer = await this.queryGemini(prompt);
      return this.extractAnswer(answer);
    } catch (error) {
      console.error('[AIHelper] Error deriving answer:', error);
      return null;
    }
  }

  buildAnswerDerivationPrompt(questionText, executionResult) {
    let prompt = `以下の問題の実行結果から、答えを導いてください。\n\n`;
    prompt += `問題文:\n${questionText}\n\n`;
    prompt += `実行結果:\n${executionResult}\n\n`;
    prompt += `指示:\n`;
    prompt += `- 問題で求められている値のみを返してください\n`;
    prompt += `- 数値の場合は数値のみ、文字列の場合は文字列のみを返してください\n`;
    prompt += `- 説明や計算過程は不要です\n`;
    return prompt;
  }

  extractAnswer(answer) {
    // AIの回答から答えを抽出
    const trimmed = answer.trim();

    // 数値の場合
    const numberMatch = trimmed.match(/\d+(\.\d+)?/);
    if (numberMatch) {
      return numberMatch[0];
    }

    // そのまま返す
    return trimmed;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIHelper;
}
