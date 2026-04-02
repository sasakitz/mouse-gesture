# 権限使用の正当性説明 / Permission Justification

Chrome Web Store 審査担当者向けの権限説明文です。
審査フォームの「権限の正当性」欄にそのままコピーして使用できます。

---

## host_permissions: `<all_urls>`

**日本語:**

本拡張機能はマウスジェスチャーによるブラウザナビゲーションを提供します。ジェスチャー認識はコンテントスクリプトがページに注入され、`mousedown`・`mousemove`・`mouseup` イベントを監視することで実現します。ユーザーはどのウェブサイトを訪問中でも右クリックドラッグによるジェスチャーを使えることを期待するため、すべての URL へのアクセスが必要です。特定のドメインに限定した場合、拡張機能としての基本機能が成立しません。

コンテントスクリプトが行うことはマウスイベントの検出と Canvas オーバーレイの描画のみです。ページのコンテンツの読み取り・変更・送信は一切行いません。

**English:**

This extension provides mouse-gesture-based browser navigation. Gesture recognition is implemented by injecting a content script that listens for `mousedown`, `mousemove`, and `mouseup` events. Users expect gestures to work on every website they visit, so access to all URLs is required. Restricting to specific domains would make the extension non-functional as a general-purpose gesture tool.

The content script only detects mouse events and renders a canvas overlay for visual feedback. It does not read, modify, or transmit any page content.

---

## `tabs` permission

**日本語:**

ジェスチャーに割り当てられたタブ操作（戻る・進む・リロード・タブを閉じる）を実行するために `chrome.tabs.goBack()`・`chrome.tabs.goForward()`・`chrome.tabs.reload()`・`chrome.tabs.remove()` を使用します。これらは Service Worker 側で実行され、コンテントスクリプトからのメッセージを受け取って処理します。

**English:**

Required to execute tab-related gesture actions: back, forward, reload, and close tab. The service worker calls `chrome.tabs.goBack()`, `chrome.tabs.goForward()`, `chrome.tabs.reload()`, and `chrome.tabs.remove()` in response to gesture messages from the content script.

---

## `storage` permission

**日本語:**

ユーザーの設定（ジェスチャーマッピング、軌跡の外観、ブラックリスト、修飾キーモードリスト）を `chrome.storage.sync` に保存・読み込みします。デバイス間での設定同期のために sync ストレージを使用しています。個人情報は一切保存しません。

**English:**

Used to persist user preferences (gesture mappings, trail appearance, blacklist, modifier-key site list) via `chrome.storage.sync`. Sync storage is used so settings are shared across the user's Chrome devices. No personal data is stored.

---

## データ収集に関する宣言

本拡張機能は以下のデータを**収集しません**:

- 個人を特定できる情報
- 閲覧履歴・URL
- キーストローク・フォーム入力
- 財務・決済情報
- 健康・医療情報
- 認証情報

外部サーバーとの通信は一切行いません。すべてのデータはユーザーのブラウザ内（`chrome.storage.sync`）にのみ存在します。

**This extension does NOT collect:**

- Personally identifiable information
- Browsing history or visited URLs
- Keystrokes or form input
- Financial or payment data
- Health or medical information
- Authentication credentials

No data is transmitted to any external server. All data exists solely within the user's browser via `chrome.storage.sync`.

---

## Single Purpose Description

**単一の目的（English required by CWS policy）:**

Mouse Gesture enables users to perform browser navigation actions (back, forward, reload, close tab, scroll to top/bottom) by holding the right mouse button and dragging in a specific direction on any web page.
