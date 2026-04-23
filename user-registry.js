/* ══════════════════════════════════════════════════════════════
   user-registry.js — FPL Dashboard User Registry
   Menyimpan ke data/users.json di repo GitHub via Contents API.
   Requires CFG.githubOwner, CFG.githubRepo, CFG.githubToken
   (PAT dengan scope 'contents:write' atau 'repo')
   ══════════════════════════════════════════════════════════════ */

const UserRegistry = {
  FILE_PATH: 'data/users.json',

  _apiUrl() {
    return `https://api.github.com/repos/${CFG.githubOwner}/${CFG.githubRepo}/contents/${this.FILE_PATH}`;
  },

  _headers() {
    return {
      'Authorization': `Bearer ${CFG.githubToken}`,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json',
    };
  },

  isConfigured() {
    return !!(CFG.githubOwner && CFG.githubRepo && CFG.githubToken);
  },

  async _read() {
    if (!this.isConfigured()) return { data: { users: [] }, sha: null };
    try {
      const res = await fetch(this._apiUrl(), { headers: this._headers() });
      if (res.status === 404) return { data: { users: [] }, sha: null };
      if (!res.ok) return null;
      const file = await res.json();
      const content = JSON.parse(atob(file.content.replace(/\n/g, '')));
      return { data: content, sha: file.sha };
    } catch { return null; }
  },

  async _write(data, sha) {
    if (!this.isConfigured()) return false;
    try {
      const body = {
        message: `chore: update user registry [skip ci]`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
      };
      if (sha) body.sha = sha;
      const res = await fetch(this._apiUrl(), {
        method:  'PUT',
        headers: this._headers(),
        body:    JSON.stringify(body),
      });
      return res.ok;
    } catch { return false; }
  },

  // Dipanggil saat user menyimpan settings dengan team ID valid
  async register(entryId, teamName, playerName) {
    if (!entryId || !this.isConfigured()) return;
    const result = await this._read();
    if (!result) return;

    const { data, sha } = result;
    const now = new Date().toISOString();
    const idx = data.users.findIndex(u => u.entryId === entryId);

    if (idx === -1) {
      data.users.push({ entryId, teamName, playerName, firstSeen: now, lastSeen: now, usageCount: 1 });
    } else {
      data.users[idx].teamName   = teamName;
      data.users[idx].playerName = playerName;
      data.users[idx].lastSeen   = now;
      data.users[idx].usageCount = (data.users[idx].usageCount || 0) + 1;
    }

    await this._write(data, sha);
  },

  // Mengembalikan semua user terdaftar
  async getAll() {
    const result = await this._read();
    return result?.data ?? null;
  },
};
