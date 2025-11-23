// Global variables
let isTranslating = false;
let selectedLanguage = 'vi';
let originalCuesText = new Map();
let translatedSubtitles = new Map();
let subtitles = [];
let currentUrl = window.location.href;
let currentVideoSrc = null;

// Message listener from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.method === 'translate') {
        isTranslating = true;
        selectedLanguage = request.lang || 'vi';
        const icon = document.querySelector('.translate-icon');
        if (icon) {
            icon.style.backgroundColor = '#1E80E2';
        }
        setTimeout(() => openBilingual(), 100);
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

// Get current site
function getCurrentSite() {
    const url = window.location.href;
    if (url.includes('coursera.org')) return 'coursera';
    if (url.includes('learn.deeplearning.ai')) return 'deeplearning';
    return null;
}

// Main translation function
async function openBilingual() {
    const site = getCurrentSite();
    if (site === 'coursera') {
        await translateCoursera();
    } else if (site === 'deeplearning') {
        await translateDeeplearning();
    }
}

// Translate Coursera subtitles
async function translateCoursera() {
    const tracks = document.getElementsByTagName("track");
    let enTrack = null;

    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].srclang === "en") {
            enTrack = tracks[i];
            break;
        }
    }

    if (!enTrack) {
        console.log('No English track found');
        return;
    }

    enTrack.track.mode = "showing";
    await sleep(500);

    const cues = enTrack.track.cues;
    if (!cues || cues.length === 0) {
        console.log('No cues found');
        return;
    }

    // Save original text
    originalCuesText.clear();
    for (let i = 0; i < cues.length; i++) {
        originalCuesText.set(i, cues[i].text);
    }

    // Translate each cue individually for real-time display
    for (let i = 0; i < cues.length; i++) {
        const originalText = cues[i].text.replace(/\n/g, ' ').trim();
        if (originalText) {
            getTranslation(originalText, (translated) => {
                if (cues[i]) {
                    cues[i].text = translated;
                }
            });
        }
    }
}

// Translate Deeplearning.ai subtitles
async function translateDeeplearning() {
    console.log("Starting deeplearning translation");

    // Open transcript panel
    const transcriptButton = document.querySelector('button.vds-button[aria-label="open transcript panel"]');
    if (transcriptButton) {
        transcriptButton.click();
        await sleep(2000);
    }

    // Read transcript
    const paragraphs = document.querySelectorAll('p.text-neutral');
    const texts = [];
    
    paragraphs.forEach(p => {
        const time = p.querySelector('span.link-primary')?.innerText || '';
        const text = p.querySelector('span:not(.link-primary)')?.innerText || '';
        if (time && text) {
            texts.push([time, text.trim()]);
        }
    });

    subtitles = texts;
    console.log(`Found ${subtitles.length} subtitles`);

    // Translate all subtitles
    translatedSubtitles.clear();
    for (const [time, text] of subtitles) {
        getTranslation(text, (translated) => {
            translatedSubtitles.set(text, translated);
        });
    }

    // Close transcript panel
    await sleep(1000);
    const container = document.querySelector('div.sticky.top-0.flex.justify-between.bg-base-200.py-4.pr-4.text-neutral');
    const closeButton = container?.querySelector('button.btn.btn-circle.btn-ghost.btn-sm');
    if (closeButton) {
        closeButton.click();
    }

    // Create caption display
    createTranslatedCaptionsDiv();
    startSubtitleUpdater();
}

// Create translated captions div
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
    `;

    const cueDisplay = document.createElement('div');
    cueDisplay.setAttribute('data-part', 'cue-display');
    cueDisplay.style.cssText = `
        background-color: rgba(0, 0, 0, 0.6);
        padding: 8px 16px;
        border-radius: 8px;
        display: inline-block;
    `;

    const cueDiv = document.createElement('div');
    cueDiv.setAttribute('data-part', 'cue');
    cueDiv.style.cssText = `line-height: 1.4; white-space: pre-wrap;`;

    cueDisplay.appendChild(cueDiv);
    translatedCaptionsDiv.appendChild(cueDisplay);
    videoContainer.appendChild(translatedCaptionsDiv);

    return translatedCaptionsDiv;
}

// Update subtitles for deeplearning
function updateSubtitles(currentTime) {
    if (!isTranslating) return;

    const translatedCaptionsDiv = document.querySelector('.translated-captions');
    if (!translatedCaptionsDiv) return;

    const cueDiv = translatedCaptionsDiv.querySelector('[data-part="cue"]');
    if (!cueDiv) return;

    // Find current subtitle
    let currentSub = null;
    for (const [time, text] of subtitles) {
        const [minutes, seconds] = time.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;
        if (currentTime >= totalSeconds) {
            currentSub = text;
        } else {
            break;
        }
    }

    // Display translated text
    if (currentSub && translatedSubtitles.has(currentSub)) {
        cueDiv.textContent = translatedSubtitles.get(currentSub);
    } else {
        cueDiv.textContent = '';
    }
}

// Start subtitle updater
function startSubtitleUpdater() {
    if (window.subtitleInterval) {
        clearInterval(window.subtitleInterval);
    }

    window.subtitleInterval = setInterval(() => {
        const site = getCurrentSite();
        let videoElement = null;
        
        if (site === 'deeplearning') {
            const videoContainer = document.querySelector('div[data-media-provider]');
            videoElement = videoContainer?.querySelector('video');
        }

        if (videoElement) {
            updateSubtitles(videoElement.currentTime);
        }
    }, 100);
}

// Restore English
function restoreEnglish() {
    const site = getCurrentSite();
    
    if (site === 'deeplearning') {
        const translatedCaptionsDiv = document.querySelector('.translated-captions');
        if (translatedCaptionsDiv) {
            translatedCaptionsDiv.remove();
        }
        
        if (window.subtitleInterval) {
            clearInterval(window.subtitleInterval);
            window.subtitleInterval = null;
        }
        
        translatedSubtitles.clear();
        console.log('Restored to English for deeplearning.ai');
        
    } else if (site === 'coursera') {
        const tracks = document.getElementsByTagName("track");
        let enTrack = null;
        
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].srclang === "en") {
                enTrack = tracks[i];
                break;
            }
        }
        
        if (enTrack && enTrack.track.cues) {
            const cues = enTrack.track.cues;
            for (let i = 0; i < cues.length; i++) {
                if (originalCuesText.has(i)) {
                    cues[i].text = originalCuesText.get(i);
                }
            }
        }
        console.log('Restored to English for Coursera');
    }
}

// Translation API call
function getTranslation(text, callback) {
    const xhr = new XMLHttpRequest();
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${selectedLanguage}&dt=t&q=${encodeURIComponent(text)}`;

    xhr.open("GET", url, true);
    xhr.responseType = "text";
    xhr.onload = function () {
        if (xhr.readyState === xhr.DONE && (xhr.status === 200 || xhr.status === 304)) {
            try {
                const response = JSON.parse(xhr.responseText);
                let translated = "";
                if (response && response[0]) {
                    for (let i = 0; i < response[0].length; i++) {
                        if (response[0][i][0]) {
                            translated += response[0][i][0];
                        }
                    }
                }
                callback(translated || text);
            } catch (e) {
                console.error('Translation error:', e);
                callback(text);
            }
        }
    };
    xhr.onerror = function() {
        console.error('Translation request failed');
        callback(text);
    };
    xhr.send();
}

// Video change detection with track monitoring for Coursera
setInterval(() => {
    // Check URL change
    if (window.location.href !== currentUrl) {
        console.log('URL changed');
        currentUrl = window.location.href;
        currentVideoSrc = null;
        
        if (isTranslating) {
            setTimeout(() => {
                console.log('Auto-translating after URL change');
                openBilingual();
            }, 2000);
        }
    }
    
    // Check video source change
    const site = getCurrentSite();
    let videoElement = null;
    
    if (site === 'coursera') {
        videoElement = document.querySelector('video');
        
        // Monitor track changes for Coursera SPA
        if (videoElement && isTranslating) {
            const tracks = document.getElementsByTagName("track");
            let enTrack = null;
            
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].srclang === "en") {
                    enTrack = tracks[i];
                    break;
                }
            }
            
            // Check if track has new cues (new video loaded)
            if (enTrack && enTrack.track.cues) {
                const cuesLength = enTrack.track.cues.length;
                
                // If we have a different number of cues or no original cache, re-translate
                if (cuesLength > 0 && (!originalCuesText.size || originalCuesText.size !== cuesLength)) {
                    console.log('New Coursera video detected (cues changed)');
                    setTimeout(() => {
                        console.log('Auto-translating new Coursera video');
                        translateCoursera();
                    }, 500);
                }
            }
        }
    } else if (site === 'deeplearning') {
        const videoContainer = document.querySelector('div[data-media-provider]');
        videoElement = videoContainer?.querySelector('video');
    }
    
    // Check video src change for other cases
    if (videoElement) {
        const newVideoSrc = videoElement.src || videoElement.currentSrc;
        
        if (newVideoSrc && newVideoSrc !== currentVideoSrc) {
            console.log('Video source changed');
            currentVideoSrc = newVideoSrc;
            
            if (isTranslating && site === 'deeplearning') {
                setTimeout(() => {
                    console.log('Auto-translating after video change');
                    openBilingual();
                }, 1500);
            }
        }
    }
}, 1000);

// Additional observer for Coursera DOM changes
if (getCurrentSite() === 'coursera') {
    const observer = new MutationObserver((mutations) => {
        if (!isTranslating) return;
        
        for (const mutation of mutations) {
            // Check for track element changes
            if (mutation.addedNodes.length) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeName === 'TRACK' && node.srclang === 'en') {
                        console.log('New track element detected');
                        setTimeout(() => {
                            translateCoursera();
                        }, 800);
                        return;
                    }
                    
                    // Check if video element is added
                    if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                        console.log('New video element detected');
                        setTimeout(() => {
                            translateCoursera();
                        }, 800);
                        return;
                    }
                }
            }
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Reset toggle and subtitles when page is closed or refreshed
function handlePageTeardown() {
    const site = getCurrentSite();
    if (!site) return;

    if (isTranslating) {
        restoreEnglish();
        isTranslating = false;
    }

    if (chrome?.storage?.sync) {
        chrome.storage.sync.set({ toggleState: false }, () => {
            if (chrome.runtime?.lastError) {
                console.warn('Failed to reset toggle state:', chrome.runtime.lastError);
            }
        });
    }
}

window.addEventListener('pagehide', handlePageTeardown);
window.addEventListener('beforeunload', handlePageTeardown);

// Utility function
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
