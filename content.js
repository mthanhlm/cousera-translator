// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.method === 'translate') {
        isTranslating = true;
        const icon = document.querySelector('.translate-icon');
        if (icon) {
            icon.style.backgroundColor = '#1E80E2';
        }
        openBilingual();
        sendResponse({ method: 'translate', status: 'success' });
        return true;
    } else if (request.method === 'restoreEnglish') {
        isTranslating = false;
        const icon = document.querySelector('.translate-icon');
        if (icon) {
            icon.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        }
        restoreEnglish();
        sendResponse({ method: 'restoreEnglish', status: 'success' });
        return true;
    }
});

// Kiểm tra xem đang ở trang nào
function getCurrentSite() {
    const url = window.location.href;
    if (url.includes('coursera.org')) {
        return 'coursera';
    } else if (url.includes('learn.deeplearning.ai')) {
        return 'deeplearning';
    }
    return null;
}

async function openBilingual() {
    const site = getCurrentSite();
    if (site === 'coursera') {
        await openBilingualCoursera();
    } else if (site === 'deeplearning') {
        await openBilingualDeeplearning();
    }
}

async function openBilingualCoursera() {
    let tracks = document.getElementsByTagName("track");
    let en;

    // Thêm đoạn code kiểm tra và xóa icon nếu đã tồn tại
    const existingIcon = document.querySelector('.translate-icon');
    if (existingIcon) {
        existingIcon.remove();
    }

    if (tracks.length) {
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].srclang === "en") {
                en = tracks[i];
            }
        }

        if (en) {
            en.track.mode = "showing";

            await sleep(500);
            let cues = en.track.cues;

            // Lưu text gốc vào cache trước khi dịch
            originalCuesText.clear();
            for (let i = 0; i < cues.length; i++) {
                originalCuesText.set(i, cues[i].text);
            }

            // Tìm các điểm kết thúc câu trong phụ đề tiếng Anh
            var endSentence = [];
            for (let i = 0; i < cues.length; i++) {
                for (let j = 0; j < cues[i].text.length; j++) {
                    if (cues[i].text[j] == "." && cues[i].text[j + 1] == undefined) {
                        endSentence.push(i);
                    }
                }
            }

            var cuesTextList = getTexts(cues);
            getTranslation(cuesTextList, (translatedText) => {
                var translatedList = translatedText.split(/[zZ]\s*~~~\s*[zZ]/);
                translatedList.splice(-1, 1);

                for (let i = 0; i < endSentence.length; i++) {
                    if (i != 0) {
                        for (let j = endSentence[i - 1] + 1; j <= endSentence[i]; j++) {
                            if (cues[j] && translatedList[i]) {
                                cues[j].text = translatedList[i];
                            }
                        }
                    } else {
                        for (let j = 0; j <= endSentence[i]; j++) {
                            if (cues[j] && translatedList[i]) {
                                cues[j].text = translatedList[i];
                            }
                        }
                    }
                }
            });
        }
    }
}

let translatedSubtitles = new Map(); // Cache cho các bản dịch

// Thêm hàm để tắt/bật subtitle gốc
function toggleDefaultCaptions(shouldDisable) {
    const captionButtons = document.querySelectorAll('button.vds-caption-button');
    const captionButton = captionButtons[captionButtons.length - 1];
    if (captionButton) {
        const isPressed = captionButton.getAttribute('aria-pressed') === 'true';
        if (shouldDisable && isPressed) {
            captionButton.click(); // Tắt CC đi
            console.log('Default captions disabled');
        } else if (!shouldDisable && !isPressed) {
            captionButton.click(); // Bật CC lên
            console.log('Default captions enabled');
        }
    }
}

// Thêm hàm tạo div hiển thị phụ đề dịch
function createTranslatedCaptionsDiv() {
    const videoContainer = document.querySelector('div[data-media-provider]');
    if (!videoContainer) return null;

    let translatedCaptionsDiv = videoContainer.querySelector('.translated-captions');
    if (translatedCaptionsDiv) return translatedCaptionsDiv;

    translatedCaptionsDiv = document.createElement('div');
    translatedCaptionsDiv.className = 'translated-captions';
    translatedCaptionsDiv.style.cssText = `
        position: absolute;
        bottom: 10%;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        text-align: center;
        z-index: 1000;
        text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
        font-size: 20px;
        pointer-events: none;
        max-width: 80%;
        width: auto;
        display: flex;
        justify-content: center;
    `;

    // Tạo cấu trúc giống với phụ đề gốc
    const cueDisplay = document.createElement('div');
    cueDisplay.setAttribute('data-part', 'cue-display');
    cueDisplay.style.cssText = `
        text-align: center;
        display: inline-block;
        background-color: rgba(0, 0, 0, 0.6);
        padding: 8px 16px;
        border-radius: 8px;
        backdrop-filter: blur(2px);
        width: auto;
        min-width: min-content;
    `;

    const cueDiv = document.createElement('div');
    cueDiv.setAttribute('data-part', 'cue');
    cueDiv.style.cssText = `
        line-height: 1.4;
        white-space: pre-wrap;
        display: inline;
    `;

    cueDisplay.appendChild(cueDiv);
    translatedCaptionsDiv.appendChild(cueDisplay);
    videoContainer.appendChild(translatedCaptionsDiv);

    return translatedCaptionsDiv;
}

// Thêm biến để theo dõi observer
let captionsObserver = null;
let captionsCheckInterval = null;

// Thêm hàm để ẩn caption gốc
function hideOriginalCaptions() {
    const captionsDivs = document.querySelectorAll('.vds-captions');
    captionsDivs.forEach(div => {
        if (div) {
            div.style.display = 'none';
        }
    });
}

// Thêm hàm để theo dõi và ẩn caption gốc
function observeCaptions() {
    if (captionsObserver) return;

    const videoContainer = document.querySelector('div[data-media-provider]');
    if (!videoContainer) return;

    // Tạo observer với cấu hình mở rộng
    captionsObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // Kiểm tra các node được thêm vào
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('vds-captions')) {
                        node.style.display = 'none';
                    }
                    // Kiểm tra sâu hơn trong cây DOM
                    const captionsDivs = node.querySelectorAll ? node.querySelectorAll('.vds-captions') : [];
                    captionsDivs.forEach(div => {
                        div.style.display = 'none';
                    });
                });
            }
            // Kiểm tra các thay đổi về thuộc tính
            if (mutation.type === 'attributes' && mutation.target.classList && mutation.target.classList.contains('vds-captions')) {
                mutation.target.style.display = 'none';
            }
        });
    });

    // Theo dõi với cấu hình mở rộng
    captionsObserver.observe(videoContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    // Thêm interval check định kỳ
    if (captionsCheckInterval) {
        clearInterval(captionsCheckInterval);
    }
    captionsCheckInterval = setInterval(hideOriginalCaptions, 100);

    // Ẩn caption hiện tại
    hideOriginalCaptions();
}

// Thêm hàm để dừng theo dõi
function stopObservingCaptions() {
    if (captionsObserver) {
        captionsObserver.disconnect();
        captionsObserver = null;
    }
    if (captionsCheckInterval) {
        clearInterval(captionsCheckInterval);
        captionsCheckInterval = null;
    }
    // Khôi phục hiển thị caption gốc
    const captionsDivs = document.querySelectorAll('.vds-captions');
    captionsDivs.forEach(div => {
        if (div) {
            div.style.display = '';
        }
    });
}

async function openBilingualDeeplearning() {
    console.log("openBilingualDeeplearning");

    // Bật CC gốc và bắt đầu theo dõi
    toggleDefaultCaptions(true);
    observeCaptions();

    // Tạo div hiển thị phụ đề dịch
    createTranslatedCaptionsDiv();

    // Open transcript panel
    const transcriptButton = document.querySelector('button.vds-button[aria-label="open transcript panel"]');
    if (transcriptButton) {
        transcriptButton.click();
        console.log('Transcript panel opened');
    }

    // Wait for transcript to load
    await sleep(2000);

    // Read transcript
    const paragraphs = document.querySelectorAll('p.text-neutral');
    const texts = Array.from(paragraphs).map(p => {
        const time = p.querySelector('span.link-primary') ? p.querySelector('span.link-primary').innerText : '';
        const text = p.querySelector('span:not(.link-primary)') ? p.querySelector('span:not(.link-primary)').innerText : '';
        return [time, text];
    });

    // Process and merge subtitles
    let mergedSubtitles = [];
    let currentSubtitle = ['', ''];

    texts.forEach(([time, text], index) => {
        if (currentSubtitle[0] === '') {
            currentSubtitle[0] = time;
        }
        currentSubtitle[1] += ` ${text}`;

        if (text.trim().endsWith('.') || index === texts.length - 1) {
            mergedSubtitles.push([currentSubtitle[0], currentSubtitle[1].trim()]);
            currentSubtitle = ['', ''];
        }
    });

    // Filter valid subtitles and store them
    subtitles = mergedSubtitles.filter(sub => sub[0] !== '' && sub[1] !== '');
    console.log("Subtitles loaded:", subtitles);

    // Dịch tất cả subtitle một lần
    const allText = subtitles.map(sub => sub[1]).join(' z~~~z ');
    getTranslation(allText, (translatedText) => {
        const translations = translatedText.split(/[zZ]\s*~~~\s*[zZ]/);
        // Cache các bản dịch
        subtitles.forEach((sub, index) => {
            if (translations[index]) {
                translatedSubtitles.set(sub[1], translations[index].trim());
            }
        });
        console.log("Translations loaded:", translatedSubtitles);
    });

    // Close transcript panel
    const container = document.querySelector('div.sticky.top-0.flex.justify-between.bg-base-200.py-4.pr-4.text-neutral');
    const closeButton = container ? container.querySelector('button.btn.btn-circle.btn-ghost.btn-sm') : null;
    if (closeButton) {
        closeButton.click();
        console.log('Transcript panel closed');
    }

    // Start subtitle updater
    startSubtitleUpdater();
}

// Thêm biến để theo dõi trạng thái dịch
let isTranslating = false;

// Thêm hàm tạo và chèn icon
function createTranslateIcon() {
    const site = getCurrentSite();
    let container;

    if (site === 'coursera') {
        container = document.querySelector('#video-player-row');
    } else if (site === 'deeplearning') {
        container = document.querySelector('div[data-media-provider]');
    }

    if (!container || document.querySelector('.translate-icon')) return;

    const icon = document.createElement('div');
    icon.className = 'translate-icon';
    icon.innerHTML = '🌐';

    // Thêm sự kiện click với stopPropagation
    icon.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();

        // Toggle trạng thái dịch
        isTranslating = !isTranslating;
        icon.style.backgroundColor = isTranslating ? '#1E80E2' : 'rgba(0, 0, 0, 0.5)';

        if (isTranslating) {
            toggleDefaultCaptions(true); // Bật CC gốc
            observeCaptions(); // Bắt đầu theo dõi và ẩn caption gốc
            openBilingual();
        } else {
            stopObservingCaptions(); // Dừng theo dõi
            toggleDefaultCaptions(false); // Tắt CC gốc
            const translatedCaptionsDiv = document.querySelector('.translated-captions');
            if (translatedCaptionsDiv) {
                translatedCaptionsDiv.remove();
            }
            // Xóa style ẩn của caption gốc
            const originalCaptions = document.querySelector('.vds-captions');
            if (originalCaptions) {
                originalCaptions.style.display = '';
            }
        }
    });

    // Thêm style cho icon
    icon.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        padding: 8px;
        border-radius: 50%;
        cursor: pointer;
        z-index: 1000;
        opacity: 0.7;
        transition: opacity 0.3s, background-color 0.3s;
        font-size: 20px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto; /* Đảm bảo icon nhận được sự kiện click */
    `;

    // Thêm hover effect
    icon.addEventListener('mouseover', () => {
        icon.style.opacity = '1';
    });
    icon.addEventListener('mouseout', () => {
        icon.style.opacity = '0.7';
    });

    // Tạo một wrapper div để chứa icon
    const iconWrapper = document.createElement('div');
    iconWrapper.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        z-index: 1000;
        pointer-events: none; /* Cho phép click xuyên qua wrapper */
    `;

    iconWrapper.appendChild(icon);
    container.insertBefore(iconWrapper, container.firstChild);
}

// Thêm MutationObserver để theo dõi khi video player được load
function observeVideoContainer() {
    const site = getCurrentSite();
    let selector;

    if (site === 'coursera') {
        selector = '#video-player-row';
    } else if (site === 'deeplearning') {
        selector = 'div[data-media-provider]';
    } else {
        return;
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (document.querySelector(selector)) {
                createTranslateIcon();
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Chạy observer khi trang web load
document.addEventListener('DOMContentLoaded', observeVideoContainer);
// Chạy ngay lập tức trong trường hợp trang đã load
observeVideoContainer();

// Các hàm tiện ích
String.prototype.replaceAt = function (index, replacement) {
    return (
        this.substr(0, index) +
        replacement +
        this.substr(index + replacement.length)
    );
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTexts(cues) {
    let cuesTextList = "";
    for (let i = 0; i < cues.length; i++) {
        if (cues[i].text[cues[i].text.length - 1] == ".") {
            cues[i].text = cues[i].text.replaceAt(
                cues[i].text.length - 1,
                ". z~~~z "
            );
        }
        cuesTextList += cues[i].text.replace(/\n/g, " ") + " ";
    }
    return cuesTextList;
}

function getTranslation(words, callback) {
    console.log("getTranslation", words);
    const lang = "vi"; // Mặc định là tiếng Việt
    const xhr = new XMLHttpRequest();
    let url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURI(
        words
    )}`;

    xhr.open("GET", url, true);
    xhr.responseType = "text";
    xhr.onload = function () {
        if (xhr.readyState === xhr.DONE) {
            if (xhr.status === 200 || xhr.status === 304) {
                const translatedList = JSON.parse(xhr.responseText)[0];
                let translatedText = "";
                for (let i = 0; i < translatedList.length; i++) {
                    translatedText += translatedList[i][0];
                }
                callback(translatedText);
            }
        }
    };
    xhr.send();
}

// Cập nhật hàm updateSubtitles
function updateSubtitles(currentTime) {
    if (!isTranslating) return;

    const translatedCaptionsDiv = document.querySelector('.translated-captions');
    if (!translatedCaptionsDiv) return;

    const cueDiv = translatedCaptionsDiv.querySelector('[data-part="cue"]');
    if (!cueDiv) return;

    // Tìm phụ đề phù hợp với thời gian hiện tại
    const currentSubtitle = subtitles
        .filter(([time]) => {
            const [minutes, seconds] = time.split(':').map(Number);
            const totalSeconds = minutes * 60 + seconds;
            return currentTime >= totalSeconds;
        })
        .pop();

    // Cập nhật nội dung phụ đề
    if (currentSubtitle) {
        const [_, text] = currentSubtitle;
        // Lấy bản dịch từ cache
        const translatedText = translatedSubtitles.get(text);
        if (translatedText) {
            cueDiv.textContent = translatedText;
        }
    } else {
        cueDiv.textContent = '';
    }
}

// Cập nhật hàm startSubtitleUpdater
function startSubtitleUpdater() {
    // Clear existing interval if any
    if (window.subtitleInterval) {
        clearInterval(window.subtitleInterval);
    }

    // Start new interval
    window.subtitleInterval = setInterval(() => {
        const currentTime = getCurrentTime();
        updateSubtitles(currentTime);
    }, 1000);
}

function getCurrentTime() {
    const site = getCurrentSite();
    let videoElement;

    if (site === 'coursera') {
        videoElement = document.querySelector('video');
    } else if (site === 'deeplearning') {
        const videoContainer = document.querySelector('div[data-media-provider]');
        videoElement = videoContainer ? videoContainer.querySelector('video') : null;
    }

    if (videoElement) {
        return videoElement.currentTime;
    }
    return 0;
}

// Lưu trữ phụ đề gốc cho Coursera
let originalCuesText = new Map();

// Thêm hàm khôi phục tiếng Anh
function restoreEnglish() {
    const site = getCurrentSite();
    
    if (site === 'deeplearning') {
        // Dừng theo dõi caption
        stopObservingCaptions();
        
        // Xóa div phụ đề dịch
        const translatedCaptionsDiv = document.querySelector('.translated-captions');
        if (translatedCaptionsDiv) {
            translatedCaptionsDiv.remove();
        }
        
        // Khôi phục hiển thị caption gốc
        const originalCaptions = document.querySelectorAll('.vds-captions');
        originalCaptions.forEach(caption => {
            if (caption) {
                caption.style.display = '';
            }
        });
        
        // Dừng interval cập nhật phụ đề
        if (window.subtitleInterval) {
            clearInterval(window.subtitleInterval);
            window.subtitleInterval = null;
        }
        
        // Xóa cache bản dịch
        translatedSubtitles.clear();
        
        console.log('Restored to English for deeplearning.ai');
    } else if (site === 'coursera') {
        // Khôi phục phụ đề gốc từ cache
        let tracks = document.getElementsByTagName("track");
        let en;
        
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].srclang === "en") {
                en = tracks[i];
                break;
            }
        }
        
        if (en && en.track.cues) {
            let cues = en.track.cues;
            
            // Khôi phục text gốc từ cache
            for (let i = 0; i < cues.length; i++) {
                if (originalCuesText.has(i)) {
                    cues[i].text = originalCuesText.get(i);
                }
            }
            
            console.log('Restored to English for Coursera');
        }
    }
}
