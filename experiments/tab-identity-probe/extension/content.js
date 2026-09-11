// ページの sessionStorage に token を書き、ロードのたびに background へ申告する。
// 「復元後もこの token が読めるか」が検証の核心。
const TOKEN_KEY = "__cpe_probe_token__";

let token = null;
let wasPresent = false;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
  wasPresent = token !== null;
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem(TOKEN_KEY, token);
  }
} catch (e) {
  token = `unavailable:${e}`;
}

chrome.runtime.sendMessage({
  type: "announce",
  token,
  wasPresent,
  url: location.href,
});
