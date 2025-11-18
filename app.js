const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全に管理したい定数
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 80) * 1024 * 1024; // デフォルト80MB
const FILE_TTL_MS = Number(process.env.FILE_TTL_MINUTES || 30) * 60 * 1000;      // デフォルト30分
const DELETE_AFTER_DOWNLOAD = process.env.DELETE_AFTER_DOWNLOAD !== 'false';      // デフォルトtrue

// CORSは許可リスト方式に変更（環境変数 ALLOWED_ORIGINS にカンマ区切りで指定）
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : null;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // 同一オリジン
        if (allowedOrigins && allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'), false);
    }
}));

app.use(express.json());
app.use(express.static('public'));

// downloadsフォルダが存在しない場合は作成
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// ファイル名生成関数
function generateFileName(originalTitle = 'tiktok_video') {
    const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
    
    const randomId = uuidv4().slice(0, 8);
    
    // タイトルをクリーンアップ（特殊文字を除去）
    const cleanTitle = originalTitle
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    return `${cleanTitle}_${timestamp}_${randomId}.mp4`;
}

// TikTok URL検証（tiktok.com / vm.tiktok.com を許可）
function isValidTikTokUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        const host = parsed.hostname.toLowerCase();
        return host.endsWith('tiktok.com') || host.endsWith('vm.tiktok.com');
    } catch (_) {
        return false;
    }
}

// TikTok動画情報を取得する関数（複数APIのフォールバック）
async function getTikTokVideoInfo(url) {
    // 使用するAPIのリスト（フォールバック用）
    const apis = [
        {
            name: 'TikWM',
            url: `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
            parser: (data) => {
                if (data.code === 0 && data.data) {
                    let videoUrl = null;
                    let quality = 'Standard';
                    
                    // 最高品質の動画URLを選択
                    if (data.data.hdplay) {
                        videoUrl = data.data.hdplay;
                        quality = 'HD';
                        console.log('TikWM: HD画質を使用');
                    } else if (data.data.play) {
                        videoUrl = data.data.play;
                        console.log('TikWM: 標準画質を使用');
                    } else if (data.data.wmplay) {
                        videoUrl = data.data.wmplay;
                        console.log('TikWM: ウォーターマーク付き動画を使用');
                    }
                    
                    if (videoUrl) {
                        return {
                            videoUrl: videoUrl,
                            title: data.data.title || 'TikTok Video',
                            author: data.data.author?.unique_id || 'unknown',
                            quality: quality
                        };
                    }
                }
                throw new Error('Invalid response format');
            }
        },
        {
            name: 'SSSTik',
            url: `https://ssstik.io/abc?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data.code === 200 && data.data) {
                    let videoUrl = null;
                    let quality = 'Standard';
                    
                    // 最高品質の動画URLを選択
                    if (data.data.play) {
                        videoUrl = data.data.play;
                        quality = 'HD';
                        console.log('SSSTik: HD画質を使用');
                    }
                    
                    if (videoUrl) {
                        return {
                            videoUrl: videoUrl,
                            title: data.data.title || 'TikTok Video',
                            author: data.data.author || 'unknown',
                            quality: quality
                        };
                    }
                }
                throw new Error('Invalid response format');
            }
        },
        {
            name: 'SnapTik',
            url: `https://snaptik.app/abc2.php?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data.status === 'success' && data.data) {
                    // 最高画質のURLを選択
                    let videoUrl = null;
                    let quality = 'Standard';
                    
                    if (data.data.hd_video_url) {
                        videoUrl = data.data.hd_video_url;
                        quality = 'HD';
                        console.log('HD画質を使用');
                    } else if (data.data.video_url) {
                        videoUrl = data.data.video_url;
                        console.log('標準画質を使用');
                    }
                    
                    if (videoUrl) {
                        return {
                            videoUrl: videoUrl,
                            title: data.data.title || 'TikTok Video',
                            author: data.data.author || 'unknown',
                            quality: quality
                        };
                    }
                }
                throw new Error('Invalid response format');
            }
        },
        {
            name: 'TiklyDown',
            url: `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data && data.video) {
                    // 最高画質のURLを選択
                    let videoUrl = null;
                    let quality = 'Standard';
                    
                    if (data.video.noWatermarkHD) {
                        videoUrl = data.video.noWatermarkHD;
                        quality = 'HD';
                        console.log('HD画質（ウォーターマークなし）を使用');
                    } else if (data.video.noWatermark) {
                        videoUrl = data.video.noWatermark;
                        console.log('標準画質（ウォーターマークなし）を使用');
                    } else if (data.video.watermark) {
                        videoUrl = data.video.watermark;
                        console.log('標準画質（ウォーターマークあり）を使用');
                    }
                    
                    if (videoUrl) {
                        return {
                            videoUrl: videoUrl,
                            title: data.title || 'TikTok Video',
                            author: data.author?.unique_id || 'unknown',
                            quality: quality
                        };
                    }
                }
                throw new Error('Invalid response format');
            }
        }
    ];

    let lastError = null;

    // 各APIを順番に試す
    for (const api of apis) {
        try {
            console.log(`${api.name} APIを試行中...`);
            
            const response = await axios.get(api.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.tiktok.com/'
                },
                timeout: 15000 // 15秒のタイムアウト
            });

            // デバッグ: 利用可能な動画URL
            if (api.name === 'TikWM' && response.data.code === 0) {
                console.log(`TikWM 利用可能なフィールド:`, {
                    hasHdplay: !!response.data.data?.hdplay,
                    hasPlay: !!response.data.data?.play,
                    hasWmplay: !!response.data.data?.wmplay
                });
            }

            const result = api.parser(response.data);
            console.log(`${api.name} APIで成功しました - 品質: ${result.quality}`);
            return result;

        } catch (error) {
            console.error(`${api.name} API Error:`, error.message);
            lastError = error;
            continue; // 次のAPIを試す
        }
    }

    // すべてのAPIが失敗した場合
    throw new Error(lastError?.message || 'すべてのTikTok APIサービスが利用できません。しばらく時間をおいて再試行してください。');
}

// 動画をダウンロードする関数
async function downloadVideo(videoUrl, fileName) {
    try {
        console.log('動画ダウンロード開始:', videoUrl);
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.tiktok.com/'
            },
            timeout: 30000 // 30秒のタイムアウト
        });

        // Content-Lengthによる事前チェック
        const contentLength = Number(response.headers['content-length'] || 0);
        if (contentLength && contentLength > MAX_FILE_SIZE) {
            throw new Error('動画サイズが上限を超えています');
        }

        // MIMEタイプ簡易チェック（video/* 以外を警告）
        const contentType = response.headers['content-type'] || '';
        if (contentType && !contentType.startsWith('video/')) {
            console.warn('想定外のContent-Type:', contentType);
        }

        const filePath = path.join(DOWNLOAD_DIR, fileName);
        const writer = fs.createWriteStream(filePath);

        let downloaded = 0;
        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (downloaded > MAX_FILE_SIZE) {
                response.data.destroy(new Error('動画サイズが上限を超えています'));
            }
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('動画ダウンロード完了:', fileName);
                resolve(filePath);
            });
            writer.on('error', (error) => {
                console.error('ダウンロードエラー:', error.message);
                // 失敗した場合はファイルを削除
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                reject(new Error('動画ファイルの保存に失敗しました'));
            });
        });
    } catch (error) {
        console.error('動画ダウンロードエラー:', error.message);
        throw new Error(`動画のダウンロードに失敗しました: ${error.message}`);
    }
}

// メインルート
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 安全なダウンロードルート（静的公開をやめ、パス検証を追加）
app.get('/downloads/:fileName', (req, res) => {
    const fileName = path.basename(req.params.fileName);
    const filePath = path.join(DOWNLOAD_DIR, fileName);

    if (!filePath.startsWith(DOWNLOAD_DIR)) {
        return res.status(400).json({ error: '不正なパスです' });
    }
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
    }

    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('ファイル送信エラー:', err.message);
            return;
        }
        if (DELETE_AFTER_DOWNLOAD && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => {});
        }
    });
});

// 変換API
app.post('/api/convert', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URLが指定されていません' });
        }

        // TikTokのURLかチェック
        if (!isValidTikTokUrl(url)) {
            return res.status(400).json({ error: '有効なTikTokのURLを入力してください' });
        }

        console.log('変換開始:', url);

        // 動画情報を取得
        const videoInfo = await getTikTokVideoInfo(url);
        
        // ファイル名を生成
        const fileName = generateFileName(videoInfo.title);
        
        // 動画をダウンロード
        const filePath = await downloadVideo(videoInfo.videoUrl, fileName);
        
        console.log('変換完了:', fileName);

        res.json({
            success: true,
            fileName: fileName,
            downloadUrl: `/downloads/${fileName}`,
            title: videoInfo.title,
            author: videoInfo.author,
            quality: videoInfo.quality
        });

    } catch (error) {
        console.error('変換エラー:', error.message);
        res.status(500).json({ 
            error: '動画の変換に失敗しました。時間をおいて再試行してください。'
        });
    }
});

// ファイル削除API（オプション）
app.delete('/api/cleanup/:fileName', (req, res) => {
    try {
        const fileName = req.params.fileName;
        const filePath = path.join(DOWNLOAD_DIR, path.basename(fileName));
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: 'ファイルが削除されました' });
        } else {
            res.status(404).json({ error: 'ファイルが見つかりません' });
        }
    } catch (error) {
        res.status(500).json({ error: 'ファイルの削除に失敗しました' });
    }
});

// 期限切れファイルの定期クリーンアップ
function cleanupOldFiles() {
    try {
        const now = Date.now();
        const files = fs.readdirSync(DOWNLOAD_DIR);
        files.forEach((file) => {
            const filePath = path.join(DOWNLOAD_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > FILE_TTL_MS) {
                fs.unlinkSync(filePath);
                console.log('期限切れのファイルを削除:', file);
            }
        });
    } catch (error) {
        console.error('クリーンアップエラー:', error.message);
    }
}

// 10分ごとにクリーンアップを実行
setInterval(cleanupOldFiles, 10 * 60 * 1000).unref();
cleanupOldFiles();


app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});
