"use strict";

// ============================================================
// 通信レイヤー (PeerJS / WebRTC P2P)
// ホストがルームを作成し、ゲストはルームIDで接続する。
// シグナリングにはPeerJSの公開クラウドサーバーを使用。
// ============================================================

const Net = (() => {
  const PREFIX = "aod-derby-";
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(I/L/O/0/1)を除外
  let peer = null;
  let conns = []; // ホスト: 接続中のゲスト
  let hostConn = null; // ゲスト: ホストへの接続
  let role = null; // "host" | "guest"

  // app.js側から差し込むイベントハンドラ
  const handlers = {
    onGuestOpen: null, // (conn) ホスト: ゲストが接続してきた
    onGuestData: null, // (conn, msg) ホスト: ゲストからメッセージ
    onGuestLeave: null, // (conn) ホスト: ゲストが切断した
    onHostData: null, // (msg) ゲスト: ホストからメッセージ
    onHostLost: null, // () ゲスト: ホストとの接続が切れた
  };

  function genCode() {
    let code = "";
    for (let i = 0; i < 4; i += 1) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
  }

  function available() {
    return typeof Peer !== "undefined";
  }

  function wireGuestConn(conn) {
    conn.on("data", (data) => handlers.onGuestData?.(conn, data));
    conn.on("close", () => {
      conns = conns.filter((c) => c !== conn);
      handlers.onGuestLeave?.(conn);
    });
    conn.on("error", () => {});
  }

  function createRoom() {
    return new Promise((resolve, reject) => {
      if (!available()) {
        reject(new Error("通信ライブラリの読み込みに失敗しました。ページを再読み込みしてください。"));
        return;
      }
      const tryOnce = (attempt) => {
        const code = genCode();
        const p = new Peer(PREFIX + code.toLowerCase());
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            p.destroy();
            reject(new Error("接続がタイムアウトしました。ネットワークがWebRTCをブロックしている可能性があります。"));
          }
        }, 15000);
        p.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          peer = p;
          role = "host";
          p.on("connection", (conn) => {
            conn.on("open", () => {
              conns.push(conn);
              wireGuestConn(conn);
              handlers.onGuestOpen?.(conn);
            });
          });
          resolve(code);
        });
        p.on("error", (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          p.destroy();
          if (err.type === "unavailable-id" && attempt < 5) {
            tryOnce(attempt + 1); // コード衝突: 引き直し
          } else {
            reject(new Error(`部屋を作成できませんでした（${err.type || err.message}）`));
          }
        });
      };
      tryOnce(0);
    });
  }

  function joinRoom(code) {
    return new Promise((resolve, reject) => {
      if (!available()) {
        reject(new Error("通信ライブラリの読み込みに失敗しました。ページを再読み込みしてください。"));
        return;
      }
      const p = new Peer();
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          p.destroy();
          reject(new Error("接続がタイムアウトしました。ルームIDの確認、またはネットワーク環境を変えてお試しください。"));
        }
      }, 15000);
      p.on("open", () => {
        const conn = p.connect(PREFIX + code.toLowerCase(), { reliable: true });
        conn.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          peer = p;
          hostConn = conn;
          role = "guest";
          conn.on("data", (data) => handlers.onHostData?.(data));
          conn.on("close", () => handlers.onHostLost?.());
          resolve();
        });
        conn.on("error", (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            p.destroy();
            reject(err);
          }
        });
      });
      p.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        p.destroy();
        reject(
          err.type === "peer-unavailable"
            ? new Error("その部屋が見つかりません。ルームIDを確認してください。")
            : new Error(`接続エラー（${err.type || err.message}）`),
        );
      });
    });
  }

  function broadcast(msg) {
    conns.forEach((conn) => {
      try {
        conn.send(msg);
      } catch (e) {
        /* 切断直後は無視 */
      }
    });
  }

  function sendTo(conn, msg) {
    try {
      conn.send(msg);
    } catch (e) {
      /* 無視 */
    }
  }

  function sendToHost(msg) {
    try {
      hostConn?.send(msg);
    } catch (e) {
      /* 無視 */
    }
  }

  function destroy() {
    try {
      peer?.destroy();
    } catch (e) {
      /* 無視 */
    }
    peer = null;
    conns = [];
    hostConn = null;
    role = null;
  }

  return {
    handlers,
    available,
    createRoom,
    joinRoom,
    broadcast,
    sendTo,
    sendToHost,
    destroy,
    isActive: () => peer !== null,
    role: () => role,
  };
})();
