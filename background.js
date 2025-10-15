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
    return true;
  }

  if (request.action === 'fetchImage') {
    // 画像をfetchしてbase64に変換
    fetch(request.url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          sendResponse({
            success: true,
            data: base64,
            mimeType: blob.type || 'image/png'
          });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'Failed to read blob' });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 非同期レスポンスを許可
  }

  if (request.action === 'getAceEditorContent' && sender.tab && sender.tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => {
        const getValue = (editor) => {
          if (!editor || typeof editor.getValue !== 'function') {
            return null;
          }
          try {
            return editor.getValue();
          } catch (e) {
            return null;
          }
        };

        const operationEditor = document.querySelector('#operation-editor');
        if (operationEditor?.env?.editor) {
          const content = getValue(operationEditor.env.editor);
          if (content !== null) {
            return content;
          }
        }

        if (window.ace?.edit) {
          try {
            const editor = window.ace.edit('operation-editor');
            const content = getValue(editor);
            if (content !== null) {
              return content;
            }
          } catch (e) {
            // ignore
          }
        }

        const aceElements = document.querySelectorAll('.ace_editor');
        for (const elem of aceElements) {
          const editor = elem?.env?.editor;
          const content = getValue(editor);
          if (content !== null) {
            return content;
          }
        }

        return null;
      },
      world: 'MAIN'
    }).then(results => {
      const content = Array.isArray(results) && results.length > 0 ? results[0]?.result : null;
      sendResponse({ success: !!content, content: content || null });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'setAceEditorContent' && sender.tab && sender.tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: (code) => {
        const setValue = (editor, value) => {
          if (!editor || typeof editor.setValue !== 'function') {
            return false;
          }
          editor.setValue(value, -1);
          if (editor.session?.selection?.clearSelection) {
            editor.session.selection.clearSelection();
          }
          if (editor.resize) {
            try {
              editor.resize(true);
            } catch (e) {
              // ignore resize errors
            }
          }
          if (editor.renderer?.updateFull) {
            try {
              editor.renderer.updateFull(true);
            } catch (e) {
              // ignore renderer errors
            }
          }
          return true;
        };

        let success = false;

        const operationEditor = document.querySelector('#operation-editor');
        if (!success && operationEditor?.env?.editor) {
          success = setValue(operationEditor.env.editor, code);
        }

        if (!success && window.ace?.edit) {
          try {
            const editor = window.ace.edit('operation-editor');
            success = setValue(editor, code);
          } catch (e) {
            // ignore
          }
        }

        if (!success) {
          const aceElements = document.querySelectorAll('.ace_editor');
          for (const elem of aceElements) {
            const editor = elem?.env?.editor;
            if (editor && setValue(editor, code)) {
              success = true;
              break;
            }
          }
        }

        return success;
      },
      args: [request.code],
      world: 'MAIN'
    }).then(results => {
      const success = Array.isArray(results) && results.length > 0 && results[0]?.result === true;
      sendResponse({ success });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  return false;
});
