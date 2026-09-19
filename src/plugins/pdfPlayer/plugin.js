import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';

import { PluginType } from 'constants/pluginType';

import loading from '../../components/loading/loading';
import keyboardnavigation from '../../scripts/keyboardNavigation';
import dialogHelper from '../../components/dialogHelper/dialogHelper';
import TouchHelper from '../../scripts/touchHelper';
import { appRouter } from '../../components/router/appRouter';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import screenSaverManager from 'scripts/screensavermanager';
import Events from '../../utils/events.ts';
import BookOsd from '../bookPlayer/BookOsd/BookOsd';
import { renderComponent } from '../../utils/reactUtils';

import 'material-design-icons-iconfont';
import './style.scss';

export class PdfPlayer {
    constructor() {
        this.name = 'PDF Player';
        this.type = PluginType.MediaPlayer;
        this.id = 'pdfplayer';
        this.priority = 1;

        this.previous = this.previous.bind(this);
        this.next = this.next.bind(this);

        this.onDialogClosed = this.onDialogClosed.bind(this);
        this.onWindowKeyDown = this.onWindowKeyDown.bind(this);
        this.toggleFullscreen = this.toggleFullscreen.bind(this);

        this.zoomLevel = 1;
        this.minZoom = 0.5;
        this.maxZoom = 3;
    }

    play(options) {
        this.progress = 0;
        this.loaded = false;
        this.cancellationToken = false;
        this.pages = {};

        screenSaverManager.block();
        loading.show();

        const elem = this.createMediaElement(options);
        return this.setCurrentSrc(elem, options);
    }

    stop() {
        this.unbindEvents();
        this.unmountBookOsd?.();
        screenSaverManager.unblock();

        const stopInfo = {
            src: this.item
        };

        Events.trigger(this, 'stopped', [stopInfo]);

        const elem = this.mediaElement;
        if (elem) {
            dialogHelper.close(elem);
            this.mediaElement = null;
        }

        // hide loading animation
        loading.hide();

        // cancel page render
        this.cancellationToken = true;
    }

    destroy() {
        // Nothing to do here
    }

    currentItem() {
        return this.item;
    }

    currentTime() {
        return this.progress;
    }

    duration() {
        return this.book ? this.book.numPages : 0;
    }

    volume() {
        return 100;
    }

    isMuted() {
        return false;
    }

    paused() {
        return false;
    }

    seekable() {
        return true;
    }

    onWindowKeyDown(e) {
        if (!this.loaded) return;

        // Skip modified keys
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

        const key = keyboardnavigation.getKeyName(e);

        switch (key) {
            case 'KeyL':
            case 'ArrowRight':
            case 'Right':
                e.preventDefault();
                this.next();
                break;
            case 'KeyJ':
            case 'ArrowLeft':
            case 'Left':
                e.preventDefault();
                this.previous();
                break;
            case 'Escape':
                e.preventDefault();
                this.stop();
                break;
        }
    }

    addSwipeGestures(element) {
        this.touchHelper = new TouchHelper(element);
        Events.on(this.touchHelper, 'swiperight', () => this.previous());
        Events.on(this.touchHelper, 'swipeleft', () => this.next());

        this.addPinchZoom(element);
    }

    addPinchZoom(element) {
        let initialDistance = 0;
        let initialZoom = 1;

        const getDistance = (touches) => {
            if (touches.length < 2) return 0;
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const onTouchStart = (e) => {
            if (e.touches.length === 2) {
                initialDistance = getDistance(e.touches);
                initialZoom = this.zoomLevel;
            }
        };

        const onTouchMove = (e) => {
            if (e.touches.length === 2 && initialDistance > 0) {
                e.preventDefault();
                const currentDistance = getDistance(e.touches);
                const scale = currentDistance / initialDistance;
                let newZoom = initialZoom * scale;
                newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
                if (newZoom !== this.zoomLevel) {
                    this.zoomLevel = newZoom;
                    this.reloadCurrentPage();
                }
            }
        };

        const onTouchEnd = (e) => {
            if (e.touches.length < 2) {
                initialDistance = 0;
                if (this.zoomLevel !== initialZoom) {
                    this.saveZoomPreference();
                }
            }
        };

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: false });
        element.addEventListener('touchend', onTouchEnd, { passive: true });
        element.addEventListener('touchcancel', onTouchEnd, { passive: true });

        this._pinchHandlers = { onTouchStart, onTouchMove, onTouchEnd };
    }

    onDialogClosed() {
        this.stop();
    }

    bindEvents() {
        this.addSwipeGestures(document.querySelector('#container'));
        this.mediaElement?.addEventListener('close', this.onDialogClosed, { once: true });
        document.addEventListener('keydown', this.onWindowKeyDown);
    }

    unbindEvents() {
        this.touchHelper?.destroy();
        this.removePinchZoom();
        this.mediaElement?.removeEventListener('close', this.onDialogClosed);
        document.removeEventListener('keydown', this.onWindowKeyDown);
    }

    removePinchZoom() {
        if (this._pinchHandlers) {
            const element = document.querySelector('#container');
            if (element) {
                element.removeEventListener('touchstart', this._pinchHandlers.onTouchStart);
                element.removeEventListener('touchmove', this._pinchHandlers.onTouchMove);
                element.removeEventListener('touchend', this._pinchHandlers.onTouchEnd);
                element.removeEventListener('touchcancel', this._pinchHandlers.onTouchEnd);
            }
            this._pinchHandlers = null;
        }
    }

    toggleFullscreen() {
        setTimeout(() => this.loadPage(this.progress + 1), 200);
    }

    createMediaElement(options) {
        let elem = this.mediaElement;
        if (elem) {
            return elem;
        }

        elem = document.getElementById('pdfPlayer');
        if (!elem) {
            elem = dialogHelper.createDialog({
                exitAnimationDuration: 400,
                size: 'fullscreen',
                autoFocus: false,
                scrollY: false,
                exitAnimation: 'fadeout',
                removeOnClose: true
            });

            elem.id = 'pdfPlayer';
            elem.innerHTML = '<div id="bookOsdMount"></div><div id="container"><canvas id="canvas"></canvas></div>';

            dialogHelper.open(elem);
        }

        this.mediaElement = elem;
        this.unmountBookOsd = renderComponent(BookOsd, {
            item: options.items[0],
            onExit: this.onDialogClosed,
            onPrevious: this.previous,
            onNext: this.next,
            onToggleFullscreen: this.toggleFullscreen
        }, elem.querySelector('#bookOsdMount'));

        return elem;
    }

    setCurrentSrc(elem, options) {
        const item = options.items[0];

        this.item = item;
        this.streamInfo = {
            started: true,
            ended: false,
            item: this.item,
            mediaSource: {
                Id: item.Id
            }
        };

        return import('pdfjs-dist').then(({ GlobalWorkerOptions, getDocument }) => {
            const api = ServerConnections.getApi(item.ServerId);
            if (!api) {
                console.error('[PdfPlayer] no Api instance available for server', item.ServerId);
                return;
            }

            const downloadHref = getLibraryApi(api).getDownloadUrl({ itemId: item.Id });

            this.bindEvents();
            GlobalWorkerOptions.workerSrc = appRouter.baseUrl() + '/libraries/pdf.worker.js';

            const downloadTask = getDocument({
                url: downloadHref,
                // Disable for PDF.js XSS vulnerability
                // https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq
                isEvalSupported: false
            });
            return downloadTask.promise.then(book => {
                if (this.cancellationToken) return;
                this.currentSrc = () => downloadHref;
                this.book = book;
                this.loaded = true;

                const percentageTicks = options.startPositionTicks / 10000;
                if (percentageTicks !== 0) {
                    this.loadPage(percentageTicks + 1);
                    this.progress = percentageTicks;
                } else {
                    this.loadPage(1);
                }
            });
        });
    }

    next() {
        if (this.progress === this.duration() - 1) return;
        this.loadPage(this.progress + 2);
        this.progress = this.progress + 1;

        Events.trigger(this, 'pause');
    }

    previous() {
        if (this.progress === 0) return;
        this.loadPage(this.progress);
        this.progress = this.progress - 1;

        Events.trigger(this, 'pause');
    }

    loadPage(number) {
        const prefix = 'page';
        const pad = 2;
        const canvas = document.querySelector('#canvas');

        // generate list of cached pages by padding the requested page on both sides
        const pages = [prefix + number];
        for (let i = 1; i <= pad; i++) {
            if (number - i > 0) pages.push(prefix + (number - i));
            if (number + i < this.duration()) pages.push(prefix + (number + i));
        }

        // load any missing pages in the cache
        for (const page of pages) {
            if (!this.pages[page] || this.cacheWidth !== window.innerWidth || this.cacheHeight !== window.innerHeight) {
                this.pages[page] = document.createElement('canvas');
                this.renderPage(this.pages[page], parseInt(page.slice(4), 10));

                this.pages[page].id = 'canvas';
            }
        }

        // show the requested page
        canvas?.parentNode.replaceChild(this.pages[prefix + number], canvas);

        // track size so we can render all pages again when the screen has changed
        this.cacheWidth = window.innerWidth;
        this.cacheHeight = window.innerHeight;

        // delete all pages outside the cache area
        for (const page in this.pages) {
            if (!pages.includes(page)) {
                delete this.pages[page];
            }
        }
    }

    renderPage(canvas, number) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        this.book.getPage(number).then(page => {
            const original = page.getViewport({ scale: 1 });
            const baseScale = Math.min((window.innerHeight / original.height), (window.innerWidth / original.width));
            const scale = baseScale * this.zoomLevel;
            const viewport = page.getViewport({ scale: scale * devicePixelRatio });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            canvas.style.width = `${original.width * scale}px`;
            canvas.style.height = `${original.height * scale}px`;

            const context = canvas.getContext('2d');

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            const renderTask = page.render(renderContext);
            renderTask.promise.then(() => {
                loading.hide();
            });
        });
    }

    canPlayMediaType(mediaType) {
        return (mediaType || '').toLowerCase() === 'book';
    }

    canPlayItem(item) {
        return item.Path ? item.Path.toLowerCase().endsWith('pdf') : false;
    }
}

export default PdfPlayer;
