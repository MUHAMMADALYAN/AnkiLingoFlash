// content.js

/**
 * AnkiLingoFlash Content Script
 * 
 * This script runs in the context of web pages and handles the core functionality
 * of the AnkiLingoFlash extension, including flashcard generation, UI interactions,
 * and communication with the background script.
 */

// Check if the content script has already been loaded to avoid multiple executions
if (window.hasRun === true) {
    console.log("Content script already loaded. Skipping main execution.");
} else {
    window.hasRun = true;

    /**
     * Mapping of language codes to their respective names.
     * This is used for language detection and model selection.
     */
    const languageCodeMap = {
        'cmn': 'mandarin_simplified',
        'spa': 'spanish_es',
        'eng': 'english_us',
        'rus': 'russian',
        'arb': 'arabic_standard',
        'ben': 'bengali',
        'hin': 'hindi',
        'por': 'portuguese_pt',
        'ind': 'indonesian',
        'jpn': 'japanese',
        'fra': 'french_fr',
        'deu': 'german_de',
        'jav': 'javanese',
        'kor': 'korean',
        'tel': 'telugu',
        'vie': 'vietnamese',
        'mar': 'marathi',
        'ita': 'italian_it',
        'tam': 'tamil',
        'tur': 'turkish',
        'urd': 'urdu',
        'guj': 'gujarati',
        'pol': 'polish',
        'ukr': 'ukrainian',
        'kan': 'kannada',
        'mai': 'maithili',
        'mal': 'malayalam',
        'mya': 'burmese',
        'pan': 'punjabi',
        'ron': 'romanian',
        'nld': 'dutch_nl',
        'hrv': 'croatian',
        'tha': 'thai',
        'swh': 'swahili',
        'amh': 'amharic',
        'orm': 'oromo',
        'uzn': 'uzbek',
        'aze': 'azerbaijani',
        'kat': 'georgian',
        'ces': 'czech',
        'hun': 'hungarian',
        'ell': 'greek',
        'swe': 'swedish',
        'heb': 'hebrew',
        'zlm': 'malay',
        'dan': 'danish',
        'fin': 'finnish',
        'nor': 'norwegian',
        'slk': 'slovak'
    };

    // Variables for toast notifications
    let toastShadowRoot;
    let toastContainer;
    let currentToast = null;

    /**
     * Constants for conversation types.
     * These are used to differentiate between different API call purposes.
     */
    const CONVERSATION_TYPES = {
        FLASHCARD: 'flashcard',
        TRANSLATION: 'translation',
        CONJUGATION: 'conjugation',
        GENDER: 'gender',
        EXAMPLES: 'examples',
        EXAMPLECARD: 'exampleCard',
        EXAMPLECARDGERMAN: 'exampleCardGerman'
    };

    /** 
     * Escapes HTML characters to prevent XSS attacks.
     * 
     * @param {string} unsafeText - The text to be escaped.
     * @returns {string} The escaped text.
     */
    function escapeHTML(unsafeText) {
        return unsafeText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Initializes the toast notification system using Shadow DOM.
     * This ensures that the toast styles don't interfere with the page's styles.
     */
    function initializeToastShadowDOM() {
        // Check if the toast host element already exists, otherwise create it
        let toastHost = document.getElementById('anki-lingo-flash-toast-host');
        if (!toastHost) {
            toastHost = document.createElement('div');
            toastHost.id = 'anki-lingo-flash-toast-host';
            document.body.appendChild(toastHost);
        }

        // Attach or get the shadow root of the toast host
        toastShadowRoot = toastHost.shadowRoot || toastHost.attachShadow({ mode: 'open' });

        // Create and append the style element for toast notifications
        const style = document.createElement('style');
        style.textContent = `
            .toast-container {
                position: fixed;
                z-index: 10000;
                top: 20px;
                right: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                font-family: Arial, sans-serif;
            }
            .toast {
                display: inline-block;
                background-color: rgba(245, 245, 245, 0.95);
                color: #333;
                text-align: center;
                border-radius: 8px;
                padding: 16px;
                margin-top: 10px;
                font-size: 16px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                border: 1px solid rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(4px);
                opacity: 0;
                transform: translateY(-20px);
                transition: opacity 0.3s, transform 0.3s;
            }
            .toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            .toast .ellipsis::after {
                content: "...";
                animation: ellipsis 1s steps(3, end) infinite;
                display: inline-block;
                width: 1em;
                text-align: left;
            }
            @keyframes ellipsis {
                0% { content: ""; }
                33% { content: "."; }
                66% { content: ".."; }
                100% { content: "..."; }
            }
        `;
        toastShadowRoot.appendChild(style);

        // Create and append the toast container element
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastShadowRoot.appendChild(toastContainer);
    }

    // Retrieve the default remote model from storage
    chrome.storage.sync.get(['model'], function (result) {
        DEFAULT_REMOTE_MODEL = result.model;
    });

    console.log("content.js is loaded");

    /**
     * Creates a Shadow DOM for the extension.
     * This isolates the extension's DOM and styles from the host page.
     * 
     * @returns {ShadowRoot} The created shadow root.
     */
    function createShadowDOM() {
        const container = document.createElement('div');
        container.id = 'anki-lingo-flash-container';
        container.className = 'anki-lingo-flash-container';
        globalShadowRoot = container.attachShadow({ mode: 'closed' });
        document.body.appendChild(container);

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('style.css');
        globalShadowRoot.appendChild(link);

        return globalShadowRoot;
    }

    // Initialize the global shadow root
    globalShadowRoot = createShadowDOM();

    /**
     * Gets a localized sort function based on the given language.
     * This is used for sorting language options in the UI.
     * 
     * @param {string} language - The language code.
     * @returns {function} A comparison function for sorting.
     */
    function getLocalizedSort(language) {
        const languageCodes = {
            'english_us': 'en-US',
            'english_uk': 'en-GB',
            'english_au': 'en-AU',
            'english_ca': 'en-CA',
            'spanish_es': 'es-ES',
            'spanish_latam': 'es-419',
            'french_fr': 'fr-FR',
            'french_ca': 'fr-CA',
            'german_de': 'de-DE',
            'german_ch': 'de-CH',
            'italian_it': 'it-IT',
            'italian_ch': 'it-CH',
            'dutch_nl': 'nl-NL',
            'dutch_be': 'nl-BE',
            'portuguese_pt': 'pt-PT',
            'portuguese_br': 'pt-BR',
            'russian': 'ru-RU',
            'mandarin_simplified': 'zh-Hans',
            'mandarin_traditional': 'zh-Hant',
            'cantonese': 'yue-Hant-HK',
            'japanese': 'ja-JP',
            'arabic_standard': 'ar-SA',
            'arabic_eg': 'ar-EG',
            'korean': 'ko-KR',
            'hindi': 'hi-IN'
        };

        const localeCode = languageCodes[language] || 'en-US'; // Fallback to English if not found

        try {
            return new Intl.Collator(localeCode).compare;
        } catch (error) {
            console.warn(`Failed to create Collator for language ${language}. Falling back to default sort.`, error);
            return (a, b) => a.localeCompare(b);
        }
    }

    /**
     * Generates language options for the UI dropdown.
     * 
     * @param {string} currentLanguage - The currently selected language.
     * @returns {Promise<string>} A promise that resolves to an HTML string of language options.
     */
    async function generateLanguageOptions(currentLanguage) {
        return new Promise((resolve) => {
            chrome.i18n.getAcceptLanguages((languages) => {
                const sortFunction = getLocalizedSort(currentLanguage);

                const languageMapping = {
                    'cmn': 'mandarin_simplified',
                    'spa': 'spanish_es',
                    'eng': 'english_us',
                    'rus': 'russian',
                    'arb': 'arabic_standard',
                    'ben': 'bengali',
                    'hin': 'hindi',
                    'por': 'portuguese_pt',
                    'ind': 'indonesian',
                    'jpn': 'japanese',
                    'fra': 'french_fr',
                    'deu': 'german_de',
                    'jav': 'javanese',
                    'kor': 'korean',
                    'tel': 'telugu',
                    'vie': 'vietnamese',
                    'mar': 'marathi',
                    'ita': 'italian_it',
                    'tam': 'tamil',
                    'tur': 'turkish',
                    'urd': 'urdu',
                    'guj': 'gujarati',
                    'pol': 'polish',
                    'ukr': 'ukrainian',
                    'kan': 'kannada',
                    'mai': 'maithili',
                    'mal': 'malayalam',
                    'mya': 'burmese',
                    'pan': 'punjabi',
                    'ron': 'romanian',
                    'nld': 'dutch_nl',
                    'hrv': 'croatian',
                    'tha': 'thai',
                    'swh': 'swahili',
                    'amh': 'amharic',
                    'orm': 'oromo',
                    'uzn': 'uzbek',
                    'aze': 'azerbaijani',
                    'kat': 'georgian',
                    'ces': 'czech',
                    'hun': 'hungarian',
                    'ell': 'greek',
                    'swe': 'swedish',
                    'heb': 'hebrew',
                    'zlm': 'malay',
                    'dan': 'danish',
                    'fin': 'finnish',
                    'nor': 'norwegian',
                    'slk': 'slovak'
                };

                const languageOptions = Object.entries(languageMapping)
                    .map(([code, name]) => ({
                        code,
                        name: chrome.i18n.getMessage(name) || name
                    }))
                    .sort((a, b) => sortFunction(a.name, b.name))
                    .map(({ code, name }) =>
                        `<option value="${code}" ${currentLanguage === code ? 'selected' : ''}>${name}</option>`
                    )
                    .join('');

                resolve(languageOptions);
            });
        });
    }

    /**
     * Regenerates content for a specific part of a flashcard.
     * 
     * @param {string} part - The part of the flashcard to regenerate ('definition' or 'mnemonic').
     * @param {string} flashcardId - The ID of the flashcard to update.
     */
    
function regenerateContent(part, flashcardId) {
    checkAuth((isAuthenticated) => {
        if (!isAuthenticated) {
            showToast(chrome.i18n.getMessage("pleaseLogInForFreeTrial"));
            return;
        }

        chrome.storage.sync.get(['choice', 'model', 'isOwnCredits', 'flashcards', 'language', 'regenerationLimit', 'userId'], function (settings) {
            if (settings.choice === 'remote') {
                const flashcard = settings.flashcards[flashcardId];
                if (!flashcard) {
                    console.log('Flashcard not found');
                    return;
                }

                if (!settings.isOwnCredits && flashcard.regenerationCount[part] >= settings.regenerationLimit) {
                    showToast(chrome.i18n.getMessage(`${part}RegenerationLimitReached`, [settings.regenerationLimit]));
                    return;
                }

                flashcard.regenerationCount[part]++;
                settings.flashcards[flashcardId] = flashcard;
                chrome.storage.sync.set({ flashcards: settings.flashcards });

                showToast(chrome.i18n.getMessage(`regenerating${part.charAt(0).toUpperCase() + part.slice(1)}`), true, true);

                const reviewModal = globalShadowRoot.querySelector('#anki-lingo-flash-review-modal');
                if (reviewModal) reviewModal.style.display = 'none';

                let userPrompt;
                if (part === 'translation') {
                    userPrompt = chrome.i18n.getMessage("generateTranslation", [settings.language, flashcard.verso]);
                } else if (part === 'conjugation') {
                    userPrompt = chrome.i18n.getMessage("generateConjugation", [settings.language, flashcard.verso]);
                } else if (part === 'gender') {
                    userPrompt = chrome.i18n.getMessage("generateGender", [settings.language, flashcard.verso]);
                } else if (part === 'examples') {
                    userPrompt = chrome.i18n.getMessage("generateExamples", [settings.language, flashcard.verso]);
                } else if (part === 'exampleCard') {
                    userPrompt = chrome.i18n.getMessage("generateExampleCard", [settings.language, flashcard.verso]);
                } else if (part === 'exampleCardGerman') {
                    userPrompt = chrome.i18n.getMessage("generateExampleCardGerman", [settings.language, flashcard.exampleCard]);
                }

                chrome.runtime.sendMessage({
                    action: "callChatGPTAPI",
                    userId: settings.userId,
                    type: CONVERSATION_TYPES[part.toUpperCase()],
                    message: userPrompt,
                    language: settings.language
                }, response => {
                    if (response.success) {
                        let newContent = response.data;

                        if (part === 'translation' && newContent.translation) {
                            flashcard.translation = newContent.translation;
                        } else if (part === 'conjugation' && newContent.conjugation) {
                            flashcard.conjugation = newContent.conjugation;
                        } else if (part === 'gender' && newContent.gender) {
                            flashcard.gender = newContent.gender;
                        } else if (part === 'exampleCard' && newContent.exampleCard) {
                            flashcard.exampleCard = newContent.exampleCard;
                            // Regenerate the German example with the new English example
                            regenerateContent('exampleCardGerman', flashcardId);
                        } else if (part === 'examples' && newContent.examples) {
                            flashcard.examples = newContent.examples;
                        } else if (part === 'exampleCardGerman' && newContent.exampleCardGerman) {
                            flashcard.exampleCardGerman = newContent.exampleCardGerman;
                        } else {
                            console.log(`Invalid content for ${part}:`, newContent);
                            showToast(chrome.i18n.getMessage(`errorRegenerating${part.charAt(0).toUpperCase() + part.slice(1)}`));
                            if (reviewModal) reviewModal.style.display = 'flex';
                            return;
                        }

                        settings.flashcards[flashcardId] = flashcard;
                        chrome.storage.sync.set({ flashcards: settings.flashcards }, function () {
                            updateModalContent(flashcard);
                            removeCurrentToast();
                            if (reviewModal) reviewModal.style.display = 'flex';
                        });
                    } else {
                        console.log(`Error regenerating ${part}:`, response.error);
                        showToast(chrome.i18n.getMessage(`errorRegenerating${part.charAt(0).toUpperCase() + part.slice(1)}`));
                        if (reviewModal) reviewModal.style.display = 'flex';
                    }
                });
            } else {
                console.log('Local model regeneration not implemented');
            }
        });
    });
    }

    /**
     * Updates the content of the review modal with the given flashcard data.
     * 
     * @param {Object} flashcard - The flashcard object containing updated data.
     */
    function updateModalContent(flashcard) {
        const modal = globalShadowRoot.querySelector('#anki-lingo-flash-review-modal');
        if (modal) {
            const updateField = (selector, value) => {
                const element = modal.querySelector(selector);
                if (element) {
                    element.value = value || '';
                } else {
                    console.warn(`Element not found: ${selector}`);
                }
            };
    
            updateField('.translation', flashcard.recto);
            updateField('.back', flashcard.verso);
            updateField('.conjugation', flashcard.conjugation);
            updateField('.gender', flashcard.gender);
            updateField('.examples', flashcard.examples);
            updateField('.exampleCard', flashcard.exampleCard);
            updateField('.exampleCardGerman', flashcard.exampleCardGerman);
        } else {
            console.error('Review modal not found in the DOM');
        }
    }
    
    /**
     * Displays a toast notification.
     * 
     * @param {string} message - The message to display in the toast.
     * @param {boolean} keepOpen - Whether to keep the toast open indefinitely.
     * @param {boolean} ellipsis - Whether to show an ellipsis animation in the toast.
     */
    function showToast(message, keepOpen = false, ellipsis = false) {
        if (!toastShadowRoot) {
            initializeToastShadowDOM();
        }
    
        if (currentToast) {
            toastContainer.removeChild(currentToast);
        }
    
        currentToast = document.createElement('div');
        currentToast.className = 'toast';
        currentToast.textContent = message;
    
        if (ellipsis) {
            const ellipsisSpan = document.createElement('span');
            ellipsisSpan.className = 'ellipsis';
            currentToast.appendChild(ellipsisSpan);
        }
    
        toastContainer.appendChild(currentToast);
    
        // Force a reflow
        currentToast.offsetHeight;
    
        currentToast.classList.add('show');
    
        if (!keepOpen) {
            setTimeout(() => {
                removeCurrentToast();
            }, 3000);
        }
    }
    
    /**
     * Removes the current toast notification from the DOM.
     */
    function removeCurrentToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            setTimeout(() => {
                if (currentToast && toastContainer.contains(currentToast)) {
                    toastContainer.removeChild(currentToast);
                    currentToast = null;
                    if (toastContainer.children.length === 0) {
                        // Reset the container's position when all toasts are removed
                        toastContainer.style.transform = 'translateY(0)';
                    }
                }
            }, 300);
        }
    }
    
    /**
     * Invokes an AnkiConnect action.
     * 
     * @param {string} action - The AnkiConnect action to invoke.
     * @param {number} version - The version of the AnkiConnect API to use.
     * @param {Object} params - The parameters for the action.
     * @returns {Promise} A promise that resolves with the result of the action.
     */
    function invoke(action, version, params = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "invokeAnkiConnect",
                params: { action, version, params }
            }, response => {
                if (response.success) {
                    console.log("API call succeeded:", response.data);
                    resolve(response.data.result);
                } else {
                    console.log("API call failed:" + response.error);
                    reject(new Error(response.error));
                }
            });
        });
    }
    
    /**
     * Fetches the list of decks from Anki.
     * 
     * @returns {Promise<string[]>} A promise that resolves with an array of deck names.
     */
    function fetchDecks() {
        return invoke('deckNames', 6)
            .then(result => result)
            .catch(error => {
                console.log('Error fetching decks:', error);
                return [];
            });
    }
    
    /**
     * Checks if the user is authenticated.
     * 
     * @param {Function} callback - The callback function to execute with the authentication result.
     */
    function checkAuth(callback) {
        chrome.storage.sync.get(['user', 'choice', 'isOwnCredits', 'apiKeyValidated'], function (result) {
            console.log("Checking authentication, user:", result.user);
            if (result.choice === 'remote') {
                if (result.isOwnCredits) {
                    if (result.apiKeyValidated) {
                        callback(true);
                    } else {
                        showToast(chrome.i18n.getMessage("enterValidApiKey"));
                        callback(false);
                    }
                } else if (!result.user) {
                    console.log("User not authenticated in Free trial mode");
                    showToast(chrome.i18n.getMessage("pleaseLogInForFreeTrial"));
                    callback(false);
                } else {
                    callback(true);
                }
            } else {
                callback(true);
            }
        });
    }
    
    /**
     * Decrypts an API key.
     * 
     * @param {Object} encryptedData - The encrypted API key data.
     * @param {string} password - The password used for decryption.
     * @returns {Promise<string>} A promise that resolves with the decrypted API key.
     */
    async function decryptApiKey(encryptedData, password) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        const derivedKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: new Uint8Array(encryptedData.salt), iterations: 100000, hash: "SHA-256" },
            key,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(encryptedData.iv) },
            derivedKey,
            new Uint8Array(encryptedData.encrypted)
        );
        return new TextDecoder().decode(decrypted);
    }
    
    /**
     * Checks if the stored API key is valid.
     * 
     * @returns {Promise<boolean>} A promise that resolves with the validity of the API key.
     */
    async function isApiKeyValid() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['encryptedApiKey', 'installationPassword'], async function (result) {
                if (result.encryptedApiKey && result.installationPassword) {
                    try {
                        const apiKey = await decryptApiKey(result.encryptedApiKey, result.installationPassword);
                        chrome.runtime.sendMessage({ action: "validateApiKey", apiKey: apiKey }, function (response) {
                            const isValid = response && response.valid;
    
                            chrome.storage.sync.set({ apiKeyValidated: isValid }, function () {
                                console.log('API key validation status updated:', isValid);
                            });
                            resolve(isValid);
                        });
                    } catch (error) {
                        console.log('Error decrypting API key:', error);
                        chrome.storage.sync.set({ apiKeyValidated: false }, function () {
                            console.log('API key validation status updated: false (decryption error)');
                        });
                        resolve(false);
                    }
                } else {
                    chrome.storage.sync.set({ apiKeyValidated: false }, function () {
                        console.log('API key validation status updated: false (missing key or password)');
                    });
                    resolve(false);
                }
            });
        });
    }
    
    /**
     * Checks if the given text contains natural language characters from supported languages.
     * 
     * @param {string} text - The text to check.
     * @returns {boolean} True if the text contains natural language characters, false otherwise.
     */
    function containsNaturalLanguage(text) {
        // Regex to match characters from all supported languages
        const regex = /[\p{L}\p{M}]/u;
        return regex.test(text);
    }
    
    /**
     * Checks if a flashcard can be generated for the given user.
     * 
     * @param {string} userId - The ID of the user.
     * @param {boolean} isOwnCredits - Whether the user is using their own credits.
     * @returns {Promise<boolean>} A promise that resolves with whether a flashcard can be generated.
     */
    function checkCanGenerateFlashcard(userId, isOwnCredits) {
        return fetch('https://anki-lingo-flash.piriouvictor.workers.dev/api/generate-flashcard', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId, isOwnCredits }),
        })
            .then(response => response.json())
            .then(data => data.canGenerate);
    }
    
    /**
     * Generates a flashcard from the selected text.
     * 
     * @param {string} selectedText - The text selected by the user.
     */
    async function generateFlashcard(selectedText) {
        if (!containsNaturalLanguage(selectedText)) {
            showToast(chrome.i18n.getMessage("invalidSelectionError"));
            return;
        }
    
        try {
            const settings = await new Promise(resolve =>
                chrome.storage.sync.get(['choice', 'user', 'isOwnCredits', 'apiKeyValidated', 'freeGenerationLimit', 'userId', 'language'], resolve)
            );
    
            const language = settings.language;
            console.log('Language retrieved in content.js:', language);
    
            if (settings.choice === 'remote') {
                if (settings.isOwnCredits) {
                    const isValid = await isApiKeyValid();
                    if (isValid) {
                        await proceedWithFlashcardGeneration(selectedText, language, settings);
                    } else {
                        showToast(chrome.i18n.getMessage("pleaseEnterValidApiKey"));
                    }
                } else {
                    if (!settings.user) {
                        showToast(chrome.i18n.getMessage("pleaseLogInForFreeTrial"));
                        return;
                    }
                    const canGenerate = await checkCanGenerateFlashcard(settings.user.id, settings.isOwnCredits);
                    if (canGenerate) {
                        await proceedWithFlashcardGeneration(selectedText, language, settings);
                    } else {
                        showToast(chrome.i18n.getMessage("flashcardLimitReached", [settings.freeGenerationLimit]));
                    }
                }
            } else {
                // Local model handling (not implemented in this version)
                console.log('Local model regeneration not implemented');
            }
        } catch (error) {
            console.log('Error in generateFlashcard:', error);
            showToast(chrome.i18n.getMessage("errorCreatingFlashcard"));
        }
    }
    
    /**
     * Updates the flashcard counter in storage and UI.
     * 
     * @param {number} count - The new flashcard count.
     * @param {number} remainingCards - The number of remaining cards.
     */
    function updateFlashcardCounter(count, remainingCards) {
        chrome.storage.sync.set({
            flashcardCount: count,
            remainingCards: remainingCards
        }, () => {
            console.log('Flashcard count updated:', count);
            console.log('Remaining cards:', remainingCards);
        });
    }
    
    /**
     * Increments the flashcard count and updates the UI.
     */
    function incrementFlashcardCount() {
        chrome.runtime.sendMessage({ action: "incrementFlashcardCount" }, function (response) {
            if (response && response.success) {
                updateFlashcardCounter(response.newCount, response.remainingCards);
            } else {
                console.log('Error incrementing flashcard count:', response ? response.error : 'Unknown error');
            }
        });
    }
    
    /**
     * Displays a review modal for a given flashcard, allowing users to review and edit its content.
     * The modal includes fields for the front (definition), back (selected text), direct translation, and mnemonic.
     * Users can regenerate content, validate their changes, or cancel the review.
     * 
     * @param {Object} flashcard - The flashcard object containing its content and metadata.
     * @param {string} selectedLanguage - The language selected by the user for the flashcard.
 */
    function showReviewModal(flashcard, selectedLanguage) {
        if (currentToast) {
            removeCurrentToast();
        }
        
        const oldModal = globalShadowRoot.querySelector('#anki-lingo-flash-review-modal');
        if (oldModal) {
            oldModal.remove();
        }
        
        let selectedText = flashcard.verso;
        let contextText = '';
    
        // Tentative de récupération du texte sélectionné et du contexte
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            
            // Récupération du texte sélectionné
            selectedText = range.toString().trim();
            
            // Tentative de récupération du contexte
            let container = range.commonAncestorContainer;
            while (container && container.nodeType !== Node.ELEMENT_NODE) {
                container = container.parentNode;
            }
            
            if (container) {
                // Récupération d'un contexte plus large
                contextText = container.textContent || container.innerText || '';
            }
        }
    
        // Si nous n'avons pas pu obtenir de contexte, utilisons le texte sélectionné comme contexte
        if (!contextText) {
            contextText = selectedText;
        }
    
        console.log("Selected text:", selectedText);
        console.log("Context text:", contextText);
    
        const detectedLanguage = detectLanguage(selectedText, contextText);
        console.log("Detected language:", detectedLanguage);
    
        flashcard.detectedLanguage = detectedLanguage;
        
        const modalHtml = `
    <div id="anki-lingo-flash-review-modal" class="anki-lingo-flash-container">
        <div id="reviewModal" data-flashcard-id="${escapeHTML(flashcard.id)}">
            <div class="modal-content">
                <h2>${chrome.i18n.getMessage("reviewFlashcard")}</h2>
                <div class="section">
                    <h3>${chrome.i18n.getMessage("front")}</h3>
                    <div class="sub-section-content">
                        <div class="input-with-button">
                            <textarea class="translation editable ${isArabic(selectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.recto)}</textarea>
                            <button id="regenerateTranslation" class="regenerate-button"></button>
                        </div>
                    </div>
                    <div class="sub-section" id="mnemonic-section">
                        <div class="sub-section-content">
                            <div class="input-with-button">
                                <textarea class="exampleCard editable ${isArabic(selectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.exampleCard || '')}</textarea>
                                <button id="regenerateExampleCard" class="regenerate-button"></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="section">
                    <h3>${chrome.i18n.getMessage("back")}</h3>
                    <div class="sub-section">
                        <div class="sub-section-content">
                            <div class="input-with-button">
                                <textarea class="back editable ${isArabic(flashcard.detectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.verso)}</textarea>
                                <div class="spacer"></div>
                            </div>
                        </div>
                         <div class="sub-section" id="mnemonic-section">
                        <div class="sub-section-content">
                            <div class="input-with-button">
                                <textarea class="exampleCardGerman editable ${isArabic(selectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.exampleCardGerman || '')}</textarea>
                            </div>
                        </div>
                    </div>
                    </div>
                    <div class="sub-section">
                        <h4>${chrome.i18n.getMessage("conjugation")}</h4>
                        <div class="sub-section-content">
                            <div class="input-with-button">
                                <textarea class="conjugation editable ${isArabic(selectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.conjugation || '')}</textarea>
                                <button id="regenerateConjugation" class="regenerate-button"></button>
                            </div>
                        </div>
                    </div>
                    <div class="sub-section">
                        <h4>${chrome.i18n.getMessage("gender")}</h4>
                        <div class="sub-section-content">
                            <div class="input-with-button">
                                <textarea class="gender editable ${isArabic(selectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.gender|| '')}</textarea>
                                <button id="regenerateGender" class="regenerate-button"></button>
                            </div>
                        </div>
                    </div>
                    <div class="sub-section">
                        <h4>${chrome.i18n.getMessage("examples")}</h4>
                        <div class="sub-section-content">
                            <div class="input-with-button">
                                <textarea class="examples editable ${isArabic(selectedLanguage) ? 'rtl-language' : ''}" rows="3">${escapeHTML(flashcard.examples || '')}</textarea>
                                <button id="regenerateExamples" class="regenerate-button"></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="button-container">
                <button id="cancelReviewButton" class="modal-button">${chrome.i18n.getMessage("cancel")}</button>
                <button id="validateButton" class="modal-button">${chrome.i18n.getMessage("validate")}</button>
            </div>
        </div>
        <div id="modalBackdrop"></div>
    </div>
    `;
    
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        globalShadowRoot.appendChild(modalContainer);
    
        setupRefreshLogo();
    
        // Utilisation de la délégation d'événements
        const modal = globalShadowRoot.querySelector('#anki-lingo-flash-review-modal');
        
        modal.addEventListener('click', function(event) {
            if (event.target.id === 'validateButton') {
                const updatedFlashcard = {
                    id: flashcard.id,
                    recto: this.querySelector('#reviewModal .translation').value,
                    verso: this.querySelector('#reviewModal .back').value,
                    conjugation: this.querySelector('#reviewModal .conjugation').value,
                    gender: this.querySelector('#reviewModal .gender').value,
                    examples: this.querySelector('#reviewModal .examples').value,
                    exampleCard: this.querySelector('#reviewModal .exampleCard').value,
                    exampleCardGerman: this.querySelector('#reviewModal .exampleCardGerman').value,
                    regenerationCount: flashcard.regenerationCount,
                    detectedLanguage: flashcard.detectedLanguage
                };
    
                this.remove();
                checkAnkiRunning(updatedFlashcard);
            } else if (event.target.id === 'cancelReviewButton') {
                this.remove();
                chrome.runtime.sendMessage({ action: "flashcardCreationCanceled" }, function (response) {
                    showToast(chrome.i18n.getMessage("flashcardCreationCanceled"));
                });
            } else if (event.target.id === 'regenerateTranslation') {
                regenerateContent('translation', flashcard.id);
            } else if (event.target.id === 'regenerateConjugation') {
                regenerateContent('conjugation', flashcard.id);
            } else if (event.target.id === 'regenerateGender') {
                regenerateContent('gender', flashcard.id);
            } else if (event.target.id === 'regenerateExampleCard') {
                regenerateContent('exampleCard', flashcard.id);
            } else if (event.target.id === 'regenerateExamples') {
                regenerateContent('examples', flashcard.id);
            }
        });
    
        // Debugging
        console.log('Modal created:', modal);
        console.log('Validate button:', modal.querySelector('#validateButton'));
        console.log('Cancel button:', modal.querySelector('#cancelReviewButton'));
    
        // Assurez-vous que le DOM est complètement chargé
        setTimeout(() => {
            setupRefreshLogo();
        }, 0);
    }
    
    /**
     * Proceeds with flashcard generation after initial checks.
     * 
     * @param {string} selectedText - The text selected by the user.
     * @param {string} language - The target language for the flashcard.
     * @param {Object} settings - User settings and preferences.
     */
    async function proceedWithFlashcardGeneration(selectedText, language, settings) {
        showToast(chrome.i18n.getMessage("creatingFlashcard"), true, true);
    
        if (settings.choice === 'remote') {
            console.log('Using remote model');
    
            const userMessage = chrome.i18n.getMessage("generateFlashcardPrompt", ["german", selectedText]);
    
            try {
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: "callChatGPTAPI",
                        userId: settings.userId,
                        type: CONVERSATION_TYPES.FLASHCARD,
                        message: userMessage,
                        language: language
                    }, response => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });
    
                console.log('Full API response:', response);
                if (response.success) {
                    const flashcardData = response.data;
                    const flashcardId = Date.now().toString();
                    const newFlashcard = {
                        id: flashcardId,
                        recto: flashcardData.translation,
                        verso: selectedText,
                        conjugation: flashcardData.conjugation,
                        gender: flashcardData.gender,
                        examples: flashcardData.examples,
                        exampleCard: flashcardData.exampleCard,
                        exampleCardGerman: flashcardData.exampleCardGerman,
                        regenerationCount: { translation: 0, conjugation: 0, gender: 0, exampleCard: 0, examples: 0, exampleCardGerman:0 }
                    };
                    console.log("NEW FLASHCARD:");
                    console.log(newFlashcard);
                
                    const flashcards = settings.flashcards || {};
                    flashcards[flashcardId] = newFlashcard;
                
                    await new Promise(resolve => chrome.storage.sync.set({ flashcards: flashcards }, resolve));
                    showReviewModal(newFlashcard, language);
                    console.log('Flashcard created:', newFlashcard);
                    if (!settings.isOwnCredits) {
                        const incrementResponse = await new Promise(resolve =>
                            chrome.runtime.sendMessage({ action: "incrementFlashcardCount" }, resolve)
                        );
                        if (incrementResponse && incrementResponse.success) {
                            console.log("Flashcard count incremented successfully");
                            updateFlashcardCounter(incrementResponse.newCount, incrementResponse.remainingCards);
                        } else {
                            console.log("Failed to increment flashcard count");
                        }
                    }
                } else {
                    console.log("API Error:", response.error);
                    if (response.error.includes('HTTP error! status: 400')) {
                        console.log("Bad Request Error. Request details:", {
                            userId: settings.userId,
                            type: CONVERSATION_TYPES.FLASHCARD,
                            language: language,
                            messageLength: userMessage.length
                        });
                    }
                    showToast(chrome.i18n.getMessage("errorCreatingFlashcard"));
                }
            } catch (error) {
                console.log("Error calling ChatGPT API:", error);
                showToast(chrome.i18n.getMessage("errorCreatingFlashcard"));
            }
        }
    }
    
    /**
     * Checks if Anki is running and proceeds accordingly.
     * 
     * @param {Object} flashcard - The flashcard object to be added to Anki.
     */
    function checkAnkiRunning(flashcard) {
        invoke('version', 6)
            .then(() => {
                showDeckSelectionModal(flashcard);
            })
            .catch(() => {
                showAnkiNotOpenModal(flashcard);
            });
    }
    
    /**
     * Displays a modal informing the user that Anki is not open.
     * 
     * @param {Object} flashcard - The flashcard object that was being processed.
     */
    function showAnkiNotOpenModal(flashcard) {
        console.log("Showing Anki not open modal");
    
        const modalHtml = `
            <div id="anki-lingo-flash-anki-not-open-modal" class="anki-lingo-flash-container">
                <div id="ankiNotOpenModal">
                    <h2>${chrome.i18n.getMessage("error")}</h2>
                    <p>${chrome.i18n.getMessage("pleaseEnsureAnkiOpen")}</p>
                    <div class="button-container">
                        <button id="cancelButton" class="modal-button">${chrome.i18n.getMessage("cancel")}</button>
                        <button id="retryButton" class="modal-button">${chrome.i18n.getMessage("tryAgain")}</button>
                    </div>
                </div>
                <div id="modalBackdrop"></div>
            </div>
        `;
    
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        globalShadowRoot.appendChild(modalContainer);
    
        const linkElement = globalShadowRoot.querySelector('#ankiNotOpenModal a');
        if (linkElement) {
            linkElement.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.runtime.sendMessage({ action: "openTab", url: e.target.href });
            });
        }
    
        globalShadowRoot.getElementById('cancelButton').addEventListener('click', () => {
            globalShadowRoot.querySelector('#anki-lingo-flash-anki-not-open-modal').remove();
            showToast(chrome.i18n.getMessage("flashcardCreationCanceled"));
        });
    
        globalShadowRoot.getElementById('retryButton').addEventListener('click', () => {
            globalShadowRoot.querySelector('#anki-lingo-flash-anki-not-open-modal').remove();
            checkAnkiRunning(flashcard);
        });
    }
    
    /**
     * Checks if the model for a specific language exists in Anki, and creates it if not.
     * 
     * @param {string} modelName - The name of the model to check/create.
     * @returns {Promise} A promise that resolves when the model is checked/created.
     */
    function checkAndCreateModelForLanguage(modelName) {
        return invoke('modelNames', 6)
            .then(models => {
                if (!models.includes(modelName)) {
                    return invoke('createModel', 6, {
                        modelName: modelName,
                        inOrderFields: ["Selection", "Translation", "Examples", "Conjugation", "Grammer", "ExampleCard", "ExampleCardGerman", "Add Reverse", "Type In Answer"],
                        cardTemplates: [
                            {
                                Name: "Card 1 (Basic or Type-in)",
                                Front: `{{#Type In Answer}}
                                        {{Translation}}
                                        <br><br>
                                        {{#Mnemonic}}
                                            <div style='font-family: "Arial"; font-size: 18px;'>
                                                <b>${chrome.i18n.getMessage("ExampleCard")}</b><br>
                                                {{Mnemonic}}
                                            </div>
                                        {{/Mnemonic}}
                                        <br><br>
                                        ${chrome.i18n.getMessage("TypeTheAnswer")}:
                                        {{type:Selection}}
                                        {{/Type In Answer}}
                                        {{^Type In Answer}}
                                        {{Translation}}
                                        {{/Type In Answer}}`,
                                Back: `{{FrontSide}}
                                    <hr id="answer">
                                    <div style='font-family: "Arial"; font-size: 20px; text-align: center;'>
                                        <div style="margin-bottom: 5px;">{{Selection}}</div>
                                        {{^Type In Answer}}
                                        <div style="margin-bottom: 10px;">${chrome.i18n.getMessage('moveLineHere')}</div>
                                        {{/Type In Answer}}
                                    </div>
                                    {{#Mnemonic}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("ExampleCardGerman")}</b><br>
                                        {{Mnemonic}}
                                    </div>
                                    {{/Mnemonic}}
                                    {{#Context}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("Conjugation")}</b><br>
                                        {{Context}}
                                    </div>
                                    {{/Context}}
                                    {{#Context}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("Gender")}</b><br>
                                        {{Context}}
                                    </div>
                                    {{/Context}}
                                    {{#Examples}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("Examples")}</b><br>
                                        {{Examples}}
                                    </div>
                                    {{/Examples}}
                                    `
                            },
                            {
                                Name: "Card 2 (Reverse)",
                                Front: `{{#Add Reverse}}
                                    <div style='font-family: "Arial"; font-size: 20px; text-align: center;'>{{Selection}}</div>
                                    {{#Mnemonic}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("ExampleCardGerman")}</b><br>
                                        {{Mnemonic}}
                                    </div>
                                    {{/Mnemonic}}
                                {{/Add Reverse}}`,
                                Back: `{{#Add Reverse}}
                                    {{FrontSide}}
                                    <hr id="answer">
                                    <div style='font-family: "Arial"; font-size: 20px; text-align: center;'>
                                        <i>{{Translation}}</i>
                                    </div>
                                    {{#Mnemonic}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("ExampleCard")}</b><br>
                                        {{Mnemonic}}
                                    </div>
                                    {{/Mnemonic}}
                                    {{#Context}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("Conjugation")}</b><br>
                                        {{Context}}
                                    </div>
                                    {{/Context}}
                                    {{#Context}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("Gender")}</b><br>
                                        {{Context}}
                                    </div>
                                    {{/Context}}
                                    {{#Examples}}
                                    <br>
                                    <div style='font-family: "Arial"; font-size: 18px;'>
                                        <b>${chrome.i18n.getMessage("Examples")}</b><br>
                                        {{Examples}}
                                    </div>
                                    {{/Examples}}       
                                {{/Add Reverse}}`
                            }
                        ]
                    });
                } else {
                    console.log(`Model ${modelName} already exists.`);
                    return Promise.resolve();
                }
            });
    }
    
    /**
     * Checks if the model exists, creates it if necessary, and then adds the note to Anki.
     * 
     * @param {string} selectedDeck - The name of the selected Anki deck.
     * @param {Object} data - The flashcard data.
     * @param {string} modelName - The name of the Anki model to use.
     * @returns {Promise} A promise that resolves when the note is added.
     */
    function checkAndCreateModelBeforeAdding(selectedDeck, data, modelName, createReverse, createTypeInAnswer) {
        console.log("Starting checkAndCreateModelBeforeAdding");
        console.log("Selected deck:", selectedDeck);
        console.log("Model name:", modelName);
        console.log("Flashcard data:", data);
        console.log("Create reverse card:", createReverse);
        console.log("Create type-in-answer card:", createTypeInAnswer);
    
        return checkAndCreateModelForLanguage(modelName)
            .then(() => {
                console.log("Model checked/created successfully");
    
                const note = {
                    "deckName": selectedDeck,
                    "modelName": modelName,
                    "fields": {
                        "Translation": data.recto,
                        "Selection": data.verso,
                        "Conjugation": data.conjugation || '',
                        "Grammer": data.gender || '',
                        "Examples": data.examples || '',
                        "ExampleCard": data.exampleCard || '',
                        "ExampleCardGerman": data.exampleCardGerman || '',
                        "Add Reverse": createReverse ? "1" : "",
                        "Type In Answer": createTypeInAnswer ? "1" : ""
                    },
                    "options": {
                        allowDuplicate: true,
                        duplicateScope: "deck"
                    },
                    "tags": []
                };
    
                console.log("Prepared note:", note);
                return invoke('addNote', 6, { note });
            })
            .then(result => {
                console.log("Note added successfully:", result);
                return result;
            })
            .catch(error => {
                console.error("Error in checkAndCreateModelBeforeAdding:", error);
                throw error;
            });
    }
    
    /**
     * Detects the language of the given text using context from the original element.
     * 
     * @param {string} text - The text to detect the language of.
     * @param {Element} originalElement - The original DOM element containing the text.
     * @returns {string} The detected language code.
     */
    function detectLanguage(text, contextText) {
        const languagesToCheck = ['cmn', 'spa', 'eng', 'rus', 'arb', 'ben', 'hin', 'por', 'ind', 'jpn', 'fra', 'deu', 'jav', 'kor', 'tel', 'vie', 'mar', 'ita', 'tam', 'tur', 'urd', 'guj', 'pol', 'ukr', 'kan', 'mai', 'mal', 'mya', 'pan', 'ron', 'nld', 'hrv', 'tha', 'swh', 'amh', 'orm', 'uzn', 'aze', 'kat', 'ces', 'hun', 'ell', 'swe', 'heb', 'zlm', 'dan', 'fin', 'nor', 'slk'];
    
        function detectWithFranc(text) {
            return window.francAll(text, {
                minLength: 1,
                whitelist: languagesToCheck
            })[0][0];
        }
    
        let initialDetection = detectWithFranc(text);
        console.log("Initial detection:", initialDetection);
    
        if (languagesToCheck.includes(initialDetection) && contextText) {
            let contextDetection = detectWithFranc(contextText);
            console.log("Context detection:", contextDetection);
    
            if (contextDetection !== initialDetection) {
                // Si la détection du contexte est différente, on cherche une langue majoritaire
                let detections = [initialDetection, contextDetection];
                let chunks = contextText.split(/\s+/);
                for (let i = 0; i < chunks.length; i += 20) {
                    let chunk = chunks.slice(i, i + 20).join(' ');
                    let chunkDetection = detectWithFranc(chunk);
                    detections.push(chunkDetection);
                }
    
                let counts = detections.reduce((acc, lang) => {
                    acc[lang] = (acc[lang] || 0) + 1;
                    return acc;
                }, {});
    
                let majorityLang = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                if (counts[majorityLang] > detections.length / 2) {
                    console.log("Majority language found:", majorityLang);
                    return majorityLang;
                }
            }
        }
    
        console.log("Final detection:", initialDetection);
        return initialDetection;
    }
    
    /**
     * Displays a modal for selecting an Anki deck and confirming flashcard details.
     * 
     * @param {Object} data - The flashcard data to be added to Anki.
     */
    async function showDeckSelectionModal(data) {
        const decks = await fetchDecks();
        
        chrome.storage.sync.get(['lastUsedDeck', 'language', 'createReverseCardToggle', 'createTypeInAnswerToggle'], async function (result) {
            let lastUsedDeck = result.lastUsedDeck;
            const currentLanguage = 'deu'; // Fixed to German
            
            const languageOptions = await generateLanguageOptions(currentLanguage);

            const deckOptions = decks.map(deck =>
                `<option value="${deck}" ${deck === lastUsedDeck ? 'selected' : ''}>${deck}</option>`
            ).join('');
    
            const createReverseCardToggle = result.createReverseCardToggle !== undefined ? result.createReverseCardToggle : true;
            const createTypeInAnswerToggle = result.createTypeInAnswerToggle !== undefined ? result.createTypeInAnswerToggle : false;
    
            let modalHtml = `
                <div id="anki-lingo-flash-deck-selection-modal" class="anki-lingo-flash-container">
                    <div id="flashcardModal">
                        <div class="form-group">
                            <label for="deckSelect">${chrome.i18n.getMessage("selectTheDeck")}</label>
                            <select id="deckSelect">
                                ${deckOptions}
                            </select>
                        </div>
                        <div class="language-selection">
                            <label for="languageSelect">${chrome.i18n.getMessage("selectLanguage")}</label>
                            <select id="languageSelect">
                                ${languageOptions}
                            </select>
                        </div>
                        <div class="create-reverse-checkbox">
                            <label for="createReverseCardToggle">${chrome.i18n.getMessage("CreateReverseCardLabel")}</label>
                            <label class="toggle-switch">
                                <input type="checkbox" id="createReverseCardToggle" name="createReverseCardToggle" ${createReverseCardToggle ? 'checked' : ''}>
                                <span class="slider">
                                    <span class="toggle-label" data-state="off">No</span>
                                    <span class="toggle-label" data-state="on">Yes</span>
                                </span>
                            </label>
                        </div>
                        <div class="create-type-in-answer-checkbox">
                            <label for="createTypeInAnswerToggle">${chrome.i18n.getMessage("CreateTypeInAnswerLabel")}</label>
                            <label class="toggle-switch">
                                <input type="checkbox" id="createTypeInAnswerToggle" name="createTypeInAnswerToggle" ${createTypeInAnswerToggle ? 'checked' : ''}>
                                <span class="slider">
                                    <span class="toggle-label" data-state="off">No</span>
                                    <span class="toggle-label" data-state="on">Yes</span>
                                </span>
                            </label>
                        </div>
                        <div class="button-container">
                            <button id="cancelButton" class="modal-button">${chrome.i18n.getMessage("cancel")}</button>
                            <button id="validateButton" class="modal-button">${chrome.i18n.getMessage("validate")}</button>
                        </div>
                    </div> 
                    <div id="modalBackdrop"></div>
                </div>
            `;
    
            // Insert modal HTML into the shadow DOM
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalHtml;
            globalShadowRoot.appendChild(modalContainer);
    
            // Set the detected language in the dropdown
            const languageSelect = globalShadowRoot.querySelector('#languageSelect');
            if (languageSelect) {
                languageSelect.value = currentLanguage;
            }
    
            // Handle validate button click
            globalShadowRoot.querySelector('#validateButton').addEventListener('click', () => {
                const selectedDeck = globalShadowRoot.querySelector('#deckSelect').value;
                const selectedLanguage = globalShadowRoot.querySelector('#languageSelect').value;
                const createReverse = globalShadowRoot.querySelector('#createReverseCardToggle').checked;
                const createTypeInAnswer = globalShadowRoot.querySelector('#createTypeInAnswerToggle').checked;
    
                console.log("Selected deck:", selectedDeck);
                console.log("Selected language:", selectedLanguage);
                console.log("Create reverse card:", createReverse);
                console.log("Create type-in-answer card:", createTypeInAnswer);
    
                // Map selected language to long language code
                const longLanguageCode = languageCodeMap[selectedLanguage];
                const languageName = chrome.i18n.getMessage(longLanguageCode);
                const modelName = `AnkiLingoFlash_${languageName}`;
                console.log("Model name:", modelName);
    
                // Save the user's choices for future use
                chrome.storage.sync.set({ 
                    createReverseCardToggle: createReverse,
                    createTypeInAnswerToggle: createTypeInAnswer
                });
    
                // Check and create model before adding flashcard
                checkAndCreateModelBeforeAdding(selectedDeck, data, modelName, createReverse, createTypeInAnswer)
                    .then(result => {
                        console.log("Note added successfully:", result);
                        showToast(chrome.i18n.getMessage("flashcardAddedToDeck", [selectedDeck]));
                        globalShadowRoot.querySelector('#anki-lingo-flash-deck-selection-modal').remove();
                        chrome.storage.sync.set({ lastUsedDeck: selectedDeck });
                    })
                    .catch(error => {
                        console.error("Error adding note:", error);
                        showToast(chrome.i18n.getMessage("errorAddingFlashcard") + ": " + error.message);
                    });
            });
    
            // Handle cancel button click
            globalShadowRoot.querySelector('#cancelButton').addEventListener('click', () => {
                showToast(chrome.i18n.getMessage("flashcardCreationCanceled"));
                globalShadowRoot.querySelector('#anki-lingo-flash-deck-selection-modal').remove();
            });
        });
    }
    
    /**
     * Sets up the refresh logo for regenerate buttons.
     */
    function setupRefreshLogo() {
        setTimeout(() => {
            const regenerateButtons = globalShadowRoot.querySelectorAll('#anki-lingo-flash-review-modal .regenerate-button');
    
            if (regenerateButtons.length === 0) {
                return;
            }
    
            const iconURL = chrome.runtime.getURL('icons/refresh_logo.svg');
            regenerateButtons.forEach(button => {
                button.style.backgroundImage = `url("${iconURL}")`;
                button.style.backgroundSize = '20px 20px';
                button.style.backgroundRepeat = 'no-repeat';
                button.style.backgroundPosition = 'center';
                button.style.display = 'inline-block';
                console.log('Refresh logo set for button:', button);
            });
        }, 0);
    }
    
    // Call this function after the Shadow DOM is created and whenever you create new regenerate buttons
    setupRefreshLogo();
    
    /**
     * Removes the toast notification from the DOM.
     */
    function removeToast() {
        const toast = document.querySelector('.toast');
        if (toast) {
            toast.remove();
        }
    }
    
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("Received message:", request);
        if (request.action === "updateFlashcardCount") {
            console.log('Flashcard count updated:', request.count);
            console.log('Remaining cards:', request.remainingCards);
    
            chrome.tabs.query({}, function (tabs) {
                for (var i = 0; i < tabs.length; ++i) {
                    chrome.tabs.sendMessage(tabs[i].id, {
                        action: "updateFlashcardCount",
                        count: request.count,
                        remainingCards: request.remainingCards
                    });
                }
            });
        }
        else if (request.action === "initialize") {
            console.log("Content script initialized and ready to receive messages.");
            sendResponse({ ready: true });
        }
        else if (request.action === "flashcardCreationCanceled") {
            showToast(chrome.i18n.getMessage("flashcardCreationCanceled"));
        } else if (request.action === "generateFlashcard") {
            console.log('Selected text:', request.text);
    
            checkAuth((isAuthenticated) => {
                if (isAuthenticated) {
                    generateFlashcard(request.text, request.language);
                }
            });
        } else if (request.action === "showAnkiNotOpenModal") {
            showAnkiNotOpenModal(request.flashcard);
        } else if (request.action === "showToast") {
            showToast(request.message, request.keepOpen, request.ellipsis);
        }
    });
    
    // Helper function to check if a language is Arabic
    function isArabic(language) {
        return language === 'arabic_standard' || language === 'arabic_eg'; // 'arb' for Standard Arabic, 'arz' for Egyptian Arabic
    }
}