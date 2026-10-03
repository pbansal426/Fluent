// One-time microphone grant for the extension's origin; the side panel cannot show this prompt.
const status = document.getElementById('status');
const button = document.getElementById('allow');

async function closeTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab) chrome.tabs.remove(tab.id);
  else window.close();
}

async function request() {
  status.textContent = 'Waiting for your answer to the browser prompt…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone allowed. This tab will close; tap the microphone in Fluent again.';
    button.hidden = true;
    chrome.runtime.sendMessage({ type: 'fluent:mic-granted' }).catch(() => {});
    setTimeout(closeTab, 1200);
  } catch (e) {
    console.error('Fluent microphone request failed', e);
    const detail = `${e.name}: ${e.message}`;
    if (/system/i.test(e.message)) {
      status.textContent = `Your computer is blocking Chrome's microphone (${detail}). On a Mac: System Settings → Privacy & Security → Microphone → turn on Google Chrome, restart Chrome, then try again.`;
    } else if (e.name === 'NotFoundError') {
      status.textContent = `No microphone was found (${detail}). Plug one in or check your sound settings.`;
    } else if (e.name === 'NotAllowedError') {
      status.textContent = `Chrome blocked the microphone (${detail}). Click the icon at the left of the address bar, set Microphone to Allow, then press the button again.`;
    } else {
      status.textContent = `The microphone could not be opened (${detail}).`;
    }
  }
}

button.addEventListener('click', request);
request();
