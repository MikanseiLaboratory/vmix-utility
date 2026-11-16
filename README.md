# vmix-utility

[![Test Build](https://github.com/MikanseiLaboratory/vmix-utility/actions/workflows/test-build.yml/badge.svg)](https://github.com/MikanseiLaboratory/vmix-utility/actions/workflows/test-build.yml)
[![Publish Release](https://github.com/MikanseiLaboratory/vmix-utility/actions/workflows/release.yml/badge.svg)](https://github.com/MikanseiLaboratory/vmix-utility/actions/workflows/release.yml)

### About / 概要

vmix-utilityは、vMix接続とオペレーションを最適化するデスクトップアプリケーションです。Tauri（Rust + React）で構築されています。

### Installation / インストール


GitHub [Releases](https://github.com/MikanseiLaboratory/vmix-utility/releases)から最新版をダウンロードしてください。

- **Windows**: `.msi` installer
- **macOS**: `.dmg` file (Intel and Apple Silicon)
- **Linux**: `.AppImage` file

### macOS で「“vmix-utility”は壊れているため開けません」と表示される場合

古いリリース(v2.3.0以前)のmacOSビルドはappバンドル全体のコード署名が不完全な状態で配布されており、Apple SiliconのGatekeeperがダウンロード済みappを「壊れている」と判定してゴミ箱への移動を要求します。

v2.3.1以降はバンドル全体がad-hoc署名されるため、この「壊れている」ダイアログは表示されなくなります。ただし Apple Developer Program での署名・公証( Developer ID + notarization )を行っていないため、macOSは初回起動時に「開発元を検証できません / Apple could not verify」と表示してブロックすることがあります。その場合は次のいずれかで起動できます:

- **システム設定 → プライバシーとセキュリティ → "vmix-utility"はブロックされました → [このまま開く]** をクリック
- または ターミナルで quarantine 属性を削除:

  ```bash
  xattr -dr com.apple.quarantine /Applications/vmix-utility.app
  ```

### Developer / macOSビルドのメンテナンス

- ビルドは `tauri.conf.json` の `bundle.macOS.signingIdentity` が `"-"` (ad-hoc署名)のままでも `codesign -vv` を通る正しいバンドル署名が付きます。
- Apple Developer Program ($99/年) に加入している場合は、配布可能な署名に移行できます:
  1. `app/src-tauri/tauri.conf.json` の `bundle.macOS.signingIdentity` の `"-"` を `Developer ID Application: 会社名 (TEAMID)` に変更(または行を削除して `APPLE_CERTIFICATE` から自動解決)。
  2. 3つのワークフロー(`release.yml`, `pre-release.yml`, `test-build.yml`)の tauri-action に次の secrets を設定:
     - `APPLE_CERTIFICATE` (`.p12` を base64 化したもの) と `APPLE_CERTIFICATE_PASSWORD`
     - `APPLE_ID` / `APPLE_PASSWORD` (app-specific password) / `APPLE_TEAM_ID`、または `APPLE_API_KEY` / `APPLE_API_ISSUER` (と `.p8` ファイル)
  3. これで CI が codesign → notarize(staple 付き) まで自動的に行い、ダウンロードした app がそのまま起動可能になります。
- 古いリリースを入手したユーザー向けの修復スクリプト: `scripts/macos-unquarantine.sh`

### Features / 機能

- **Connections** - vMix接続を追加・管理するページします。
- **Shortcut Generator** - Shortcut FunctionのURLを作成します。
- **Blank Generator** - Blank/Colours入力を一括生成します。
- **Input Manager** - Inputを閲覧・管理します。
- **List Manager** - Input Listを閲覧・管理します。
- **Settings** - 設定です。
- **About** - リポジトリ・ライセンス・コミュニティ（Discord等）・支援の案内をまとめた画面です。

### License / ライセンス

[PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0) — 詳細は[LICENSE](LICENSE)を参照してください。

- 現場・業務での利用は無料です
- 本ソフトウェアと競合する製品・サービスの提供には利用できません
- 無償サポートは提供していません。ソフトウェアは無保証です
- 以前に配布した MIT ライセンス版は、入手済みのコピーに限り MIT の条件が引き続き適用されます

### Links / リンク

- [Download Latest Release](https://github.com/MikanseiLaboratory/vmix-utility/releases/latest)
- [Report Issues](https://github.com/MikanseiLaboratory/vmix-utility/issues)
- [Discord](https://discord.gg/YUbmg9Hq37)
- [vMix Official Website](https://www.vmix.com/)

### Maintainer / 保守・運営

[未完成成果物研究所](https://mikanseilaboratory.github.io/) が保守管理しています。

### 寄付・ご支援について

[twitch.tv/flowingspdg](https://subs.twitch.tv/flowingspdg) にてご支援が可能です。Amazon Primeを利用したサブスクライブか、ビッツを使った投げ銭が可能です。
