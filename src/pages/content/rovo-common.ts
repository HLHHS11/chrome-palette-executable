// Rovo のチャットページ判定。 URL は
// `https://home.atlassian.com/o/<organization-uuid>/chat[/...]` という形なので、
// 組織 UUID 部分はワイルドカード扱いにする。
export function isRovoChatPage(url: URL): boolean {
  if (url.hostname !== "home.atlassian.com") return false;
  return /^\/o\/[^/]+\/chat(\/|$)/.test(url.pathname);
}
