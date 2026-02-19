# ============================================
# Stage 1: yt-dlpイメージからバイナリを取得
# ============================================
FROM jauderho/yt-dlp:latest as ytdlp-image


# ============================================
# Stage 2: Denoベースの最終イメージ
# ============================================
FROM denoland/deno:alpine

USER root

# yt-dlpバイナリをコピー
COPY --from=ytdlp-image /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp

# 必要な依存関係をインストール
RUN apk add --no-cache python3 ffmpeg

# yt-dlpを実行可能にする
RUN chmod +x /usr/local/bin/yt-dlp

# 作業ディレクトリを設定
WORKDIR /app

# Cookiesファイルをコピー
# COPY cookies.txt /app/cookies.txt

# アプリケーションファイルをコピー
COPY main.ts /app/main.ts

# Denoの依存関係をキャッシュ
RUN deno cache main.ts

# ポートを公開
EXPOSE 3004

# アプリケーションを起動
CMD ["deno", "run", "--allow-net", "--allow-run", "--allow-env", "--allow-read", "main.ts"]