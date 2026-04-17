# Allah Gifts

Telegram bot on aiogram with a Telegram Mini App storefront, TON Connect wallet gate, gift catalog, and roulette UI.

## Local backend

Run the backend as a package module, not as a direct Python file:

```powershell
cd C:\Users\fre1zik\Desktop\Allah\backend
..\.venv\Scripts\python.exe -m app.main
```

Direct file execution fails because backend modules use relative imports.

## Local frontend

```powershell
cd C:\Users\fre1zik\Desktop\Allah\frontend
npm run dev
```

## GitHub Pages

The repository contains a GitHub Actions workflow at `.github/workflows/deploy.yml`.
After pushing to `main`, the static Mini App is deployed to:

```text
https://frezyyf-oss.github.io/Allah
```

The static TON Connect manifest is served from:

```text
https://frezyyf-oss.github.io/Allah/tonconnect-manifest.json
```
