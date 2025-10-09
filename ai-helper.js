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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`;

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
      const answer = await this.queryGemini(prompt);
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
      const answer = await this.queryGemini(prompt);
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

  async queryGemini(prompt) {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.apiKey}`;

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
          maxOutputTokens: 100,
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
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIHelper;
}
