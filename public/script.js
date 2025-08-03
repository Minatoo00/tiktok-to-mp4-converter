document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('convertForm');
    const urlInput = document.getElementById('tiktokUrl');
    const convertBtn = document.getElementById('convertBtn');
    const btnText = document.querySelector('.btn-text');
    const btnLoading = document.querySelector('.btn-loading');
    const resultSection = document.getElementById('result');
    const errorSection = document.getElementById('error');
    const newConversionBtn = document.getElementById('newConversion');
    const tryAgainBtn = document.getElementById('tryAgain');

    // フォーム送信イベント
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await convertVideo();
    });

    // 新しい変換ボタン
    newConversionBtn.addEventListener('click', function() {
        resetForm();
    });

    // 再試行ボタン
    tryAgainBtn.addEventListener('click', function() {
        resetForm();
    });

    // URL入力時の検証
    urlInput.addEventListener('input', function() {
        const url = this.value.trim();
        const isValidTikTokUrl = url.includes('tiktok.com') || url.includes('vm.tiktok.com');
        
        if (url && !isValidTikTokUrl) {
            this.style.borderColor = '#ef4444';
            showTooltip('有効なTikTokのURLを入力してください', this);
        } else {
            this.style.borderColor = '#e1e5e9';
            hideTooltip();
        }
    });

    async function convertVideo() {
        const url = urlInput.value.trim();
        
        if (!url) {
            showError('URLを入力してください');
            return;
        }

        if (!url.includes('tiktok.com')) {
            showError('有効なTikTokのURLを入力してください');
            return;
        }

        // ローディング状態に変更
        setLoading(true);
        hideResults();

        try {
            const response = await fetch('/api/convert', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url })
            });

            const data = await response.json();

            if (data.success) {
                showSuccess(data);
            } else {
                showError(data.error || '変換に失敗しました');
            }
        } catch (error) {
            console.error('変換エラー:', error);
            showError('ネットワークエラーが発生しました。インターネット接続を確認してください。');
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        convertBtn.disabled = isLoading;
        btnText.style.display = isLoading ? 'none' : 'inline';
        btnLoading.style.display = isLoading ? 'inline-flex' : 'none';
        urlInput.disabled = isLoading;
    }

    function showSuccess(data) {
        // 動画情報を表示
        document.getElementById('videoTitle').textContent = data.title || 'TikTok Video';
        document.getElementById('videoAuthor').textContent = data.author || 'Unknown';
        document.getElementById('videoQuality').textContent = data.quality || 'Standard';
        document.getElementById('fileName').textContent = data.fileName;
        
        // ダウンロードリンクを設定
        const downloadLink = document.getElementById('downloadLink');
        downloadLink.href = data.downloadUrl;
        downloadLink.download = data.fileName;
        
        // 結果セクションを表示
        resultSection.style.display = 'block';
        errorSection.style.display = 'none';
        
        // 成功通知
        showNotification('✅ 変換が完了しました！', 'success');
    }

    function showError(message) {
        document.getElementById('errorText').textContent = message;
        errorSection.style.display = 'block';
        resultSection.style.display = 'none';
        
        // エラー通知
        showNotification('❌ ' + message, 'error');
    }

    function hideResults() {
        resultSection.style.display = 'none';
        errorSection.style.display = 'none';
    }

    function resetForm() {
        urlInput.value = '';
        urlInput.disabled = false;
        urlInput.style.borderColor = '#e1e5e9';
        convertBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        hideResults();
        urlInput.focus();
    }

    function showNotification(message, type) {
        // 既存の通知を削除
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 新しい通知を作成
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // スタイルを設定
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        if (type === 'success') {
            notification.style.background = '#10b981';
        } else {
            notification.style.background = '#ef4444';
        }
        
        document.body.appendChild(notification);
        
        // 3秒後に自動削除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }
        }, 3000);
    }

    function showTooltip(message, element) {
        hideTooltip();
        
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = message;
        tooltip.style.cssText = `
            position: absolute;
            background: #333;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            white-space: nowrap;
            z-index: 1000;
            top: ${element.offsetTop + element.offsetHeight + 5}px;
            left: ${element.offsetLeft}px;
            animation: fadeIn 0.2s ease;
        `;
        
        element.parentNode.appendChild(tooltip);
    }

    function hideTooltip() {
        const tooltip = document.querySelector('.tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    // アニメーション用CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    // 初期フォーカス
    urlInput.focus();
});