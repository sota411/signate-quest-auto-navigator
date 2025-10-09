// SIGNATE Quest Auto Navigator - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusElement = document.getElementById('status');
  const aiStatusElement = document.getElementById('aiStatus');
  const delayInput = document.getElementById('delayInput');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const checkApiBtn = document.getElementById('checkApiBtn');
  const messageBox = document.getElementById('messageBox');

  // メッセージ表示関数
  function showMessage(message, type = 'info', duration = 3000) {
    messageBox.textContent = message;
    messageBox.className = `message-box show ${type}`;

    if (duration > 0) {
      setTimeout(() => {
        messageBox.className = 'message-box';
      }, duration);
    }
  }

  // 初期ステータスを取得
  updateStatus();
  updateAiStatus();

  // 開始ボタン
  startBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('signate.jp')) {
      showMessage('SIGNATEのページで実行してください', 'error');
      return;
    }

    // 遅延時間を保存
    const delay = parseInt(delayInput.value);
    await chrome.storage.local.set({ delay });

    // content scriptにメッセージを送信
    chrome.tabs.sendMessage(tab.id, { action: 'start' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        showMessage('エラーが発生しました。ページをリロードして再度お試しください。', 'error');
        return;
      }
      showMessage('自動ナビゲーションを開始しました', 'success');
      updateStatus();
    });
  });

  // 停止ボタン
  stopBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { action: 'stop' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        return;
      }
      showMessage('自動ナビゲーションを停止しました', 'info');
      updateStatus();
    });
  });

  // ステータス更新
  async function updateStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('signate.jp')) {
      statusElement.textContent = '対象外のページ';
      statusElement.className = 'status-value';
      startBtn.disabled = true;
      stopBtn.disabled = true;
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        statusElement.textContent = '未接続';
        statusElement.className = 'status-value';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        return;
      }

      if (response && response.isRunning) {
        statusElement.textContent = '実行中';
        statusElement.className = 'status-value running';
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        statusElement.textContent = '停止中';
        statusElement.className = 'status-value stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    });
  }

  // ステータスを定期的に更新
  setInterval(updateStatus, 1000);

  // API Key保存ボタン
  saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    await chrome.storage.local.set({ geminiApiKey: apiKey });
    showMessage('API Keyを保存しました', 'success');
    updateAiStatus();
  });

  // API接続確認ボタン
  checkApiBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('signate.jp')) {
      showMessage('SIGNATEのページで実行してください', 'error');
      return;
    }

    checkApiBtn.disabled = true;
    checkApiBtn.textContent = '確認中...';
    aiStatusElement.textContent = '確認中...';
    aiStatusElement.className = 'status-value';
    showMessage('Gemini APIへの接続を確認中...', 'info', 0);

    chrome.tabs.sendMessage(tab.id, { action: 'checkAiStatus' }, (response) => {
      checkApiBtn.disabled = false;
      checkApiBtn.textContent = '接続確認';

      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        aiStatusElement.textContent = '未接続';
        aiStatusElement.className = 'status-value';
        showMessage('エラーが発生しました。ページをリロードして再度お試しください。', 'error');
        return;
      }

      if (response && response.isAvailable) {
        aiStatusElement.textContent = response.message;
        aiStatusElement.className = 'status-value running';
        showMessage('✓ Gemini APIへの接続に成功しました！', 'success');
      } else {
        aiStatusElement.textContent = response?.message || 'エラー';
        aiStatusElement.className = 'status-value stopped';
        showMessage(`✗ 接続に失敗: ${response?.message || '不明なエラー'}`, 'error', 5000);
      }
    });
  });

  // AI ステータス更新
  async function updateAiStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('signate.jp')) {
      aiStatusElement.textContent = '対象外のページ';
      aiStatusElement.className = 'status-value';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getAiStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        aiStatusElement.textContent = '未接続';
        aiStatusElement.className = 'status-value';
        return;
      }

      if (response) {
        aiStatusElement.textContent = response.message;
        if (response.isAvailable) {
          aiStatusElement.className = 'status-value running';
        } else if (response.hasApiKey) {
          aiStatusElement.className = 'status-value stopped';
        } else {
          aiStatusElement.className = 'status-value';
        }
      }
    });
  }

  // AIステータスを定期的に更新
  setInterval(updateAiStatus, 5000);

  // 保存された設定を読み込み
  chrome.storage.local.get(['delay', 'geminiApiKey'], (result) => {
    if (result.delay) {
      delayInput.value = result.delay;
    }
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });
});
