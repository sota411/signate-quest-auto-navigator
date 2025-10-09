// AI Helper for question answering

class AIHelper {
  constructor() {
    this.apiKey = null;
    this.isAvailable = false;
    this.statusMessage = '未設定';
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'test'
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10,
          }
        })
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

  async answerQuestion(questionText, choices, questionType = 'radio') {
    if (!this.apiKey) {
      console.log('[AIHelper] No API key configured, using fallback');
      return this.fallbackAnswer(questionText, choices, questionType);
    }

    try {
      const prompt = this.buildPrompt(questionText, choices, questionType);
      const answer = await this.queryGemini(prompt, 'gemini-2.0-flash'); // 初回は高速モデル
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
      const answer = await this.queryGemini(prompt, 'gemini-2.5-flash'); // ヒント付きは高精度モデル
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

  async queryGemini(prompt, model = 'gemini-2.0-flash') {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    console.log(`[AIHelper] Using model: ${model}`);

    // コーディング問題かどうかで maxOutputTokens を変える
    const isCodingQuestion = prompt.includes('____') || prompt.includes('コード');
    const maxTokens = isCodingQuestion ? 500 : 100;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: maxTokens,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      const text = data.candidates[0].content.parts[0].text;
      console.log('[AIHelper] Gemini response received, length:', text.length);
      return text.trim();
    }

    throw new Error('No response from API');
  }

  parseAnswer(answer, choices, questionType) {
    if (questionType === 'radio') {
      // 単一選択: 最初の数字を抽出
      const match = answer.match(/\d+/);
      if (match) {
        const answerIndex = parseInt(match[0]) - 1; // 1-indexed to 0-indexed
        if (answerIndex >= 0 && answerIndex < choices.length) {
          return answerIndex;
        }
      }

      // パースに失敗した場合はフォールバック
      return this.fallbackAnswer(null, choices, questionType);
    } else if (questionType === 'checkbox') {
      // 複数選択: カンマ区切りまたは複数の数字を抽出
      const numbers = answer.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const indices = numbers
          .map(n => parseInt(n) - 1) // 1-indexed to 0-indexed
          .filter(i => i >= 0 && i < choices.length);

        if (indices.length > 0) {
          return indices;
        }
      }

      // パースに失敗した場合はフォールバック
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

  async completeCodingQuestion(questionText, code) {
    if (!this.apiKey) {
      console.log('[AIHelper] No API key configured for coding question');
      return code; // そのまま返す
    }

    try {
      const prompt = this.buildCodingPrompt(questionText, code);
      const answer = await this.queryGemini(prompt);
      return this.extractCompletedCode(answer, code);
    } catch (error) {
      console.error('[AIHelper] Error completing coding question:', error);
      return code; // エラー時はそのまま返す
    }
  }

  buildCodingPrompt(questionText, code) {
    let prompt = `以下のPythonコードの穴埋め問題に回答してください。\n\n`;
    prompt += `問題文:\n${questionText}\n\n`;
    prompt += `コード（____の部分を埋めてください）:\n${code}\n\n`;
    prompt += `指示:\n`;
    prompt += `- ____の部分に入るコードのみを考えてください\n`;
    prompt += `- 完成したコード全体を返してください\n`;
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

    // もし元のコードと同じ構造なら、そのまま返す
    if (code.includes('import') && code.includes('print')) {
      console.log('[AIHelper] ✓ Extracted completed code from AI response');
      return code;
    }

    // AIが____の部分だけを返した場合（穴埋めの内容だけ）
    // 例: "nunique, unique" や "nunique()\nunique()" など
    if (!code.includes('import') && !code.includes('def')) {
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
