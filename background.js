// SIGNATE Quest Auto Navigator - Background Script

chrome.runtime.onInstalled.addListener(() => {
  console.log('SIGNATE Quest Auto Navigator installed');
});

// メッセージリスナー（必要に応じて拡張）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'queryGemini') {
    // Gemini APIとの連携（今後実装）
    // 現在は未実装
    sendResponse({ error: 'Not implemented yet' });
  }
  return true;
});
