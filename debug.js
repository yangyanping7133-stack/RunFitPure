// Debug utilities for OSMap WebView
window.__MAP_DEBUG = {
  log: function(msg) {
    console.log('[MAP DEBUG] ' + msg);
    var el = document.getElementById('debugLog');
    if (el) {
      el.innerHTML += '<br>' + msg;
      el.scrollTop = el.scrollHeight;
    }
  },
  error: function(msg) {
    console.error('[MAP ERROR] ' + msg);
    var el = document.getElementById('debugLog');
    if (el) {
      el.innerHTML += '<br><span style="color:#f55">' + msg + '</span>';
      el.scrollTop = el.scrollHeight;
    }
  }
};
