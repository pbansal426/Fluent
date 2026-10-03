// One-time microphone grant for the extension's origin; the side panel cannot show this prompt.
const status = document.getElementById('status');

async function request() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone allowed. You can close this tab.';
    chrome.runtime.sendMessage({ type: 'fluent:mic-granted' }).catch(() => {});
    setTimeout(() => window.close(), 900);
  } catch (e) {
    status.textContent = `Microphone blocked (${e.name}). Click the icon in the address bar to allow it, then try again.`;
  }
}

document.getElementById('allow').addEventListener('click', request);
request();
