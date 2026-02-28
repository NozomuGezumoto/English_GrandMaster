# iOS実機での接続設定

## 手順

### 1. PCのIPアドレスを確認

Windowsの場合：
```bash
ipconfig
```

`IPv4 アドレス`を確認（例: `192.168.1.100`）

### 2. app.jsonを更新

`app.json`の`extra`セクションで`emulatorHost`をPCのIPアドレスに設定：

```json
{
  "expo": {
    ...
    "extra": {
      "firebase": { ... },
      "useEmulator": true,
      "emulatorHost": "192.168.1.100"  // ← PCのIPアドレスに変更
    }
  }
}
```

### 3. アプリを再起動

```bash
npm start
```

### 4. 注意事項

- PCとiOS実機が**同じWi-Fiネットワーク**に接続されている必要があります
- ファイアウォールでポート5001, 8080, 9099が開いている必要があります
- Webブラウザで試す場合は`emulatorHost`を`localhost`のままにしてください



