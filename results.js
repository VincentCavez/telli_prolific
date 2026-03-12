/**
 * DataCollector — sends response data to Google Apps Script endpoint
 * using navigator.sendBeacon() to bypass CORS entirely.
 * Falls back to localStorage if sendBeacon fails.
 *
 * sendBeacon sends a POST with Content-Type: text/plain, no preflight,
 * and the body reaches doPost(e) via e.postData.contents before the
 * Apps Script 302 redirect.
 */
const DataCollector = {
    endpoint: null,

    init(endpoint) {
        this.endpoint = endpoint;
    },

    send(data) {
        this._saveLocal(data);

        if (!this.endpoint || this.endpoint.includes('TO_BE_CONFIGURED')) {
            console.log('[DataCollector] Endpoint not configured, data saved locally:', data);
            return;
        }

        try {
            const blob = new Blob([JSON.stringify(data)], { type: 'text/plain' });
            const queued = navigator.sendBeacon(this.endpoint, blob);
            if (queued) {
                this._markSent(data);
                this._retryPending();
            } else {
                console.warn('[DataCollector] sendBeacon returned false, stored for retry');
                this._storePending(data);
            }
        } catch (e) {
            console.warn('[DataCollector] Send failed, stored for retry:', e.message);
            this._storePending(data);
        }
    },

    _saveLocal(data) {
        const key = `response_${data.participant_id}_${data.stimulus_id || 'meta'}_${data.type || 'unknown'}`;
        localStorage.setItem(key, JSON.stringify(data));
    },

    _markSent(data) {
        const key = `response_${data.participant_id}_${data.stimulus_id || 'meta'}_${data.type || 'unknown'}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            parsed._sent = true;
            localStorage.setItem(key, JSON.stringify(parsed));
        }
    },

    _storePending(data) {
        const pending = JSON.parse(localStorage.getItem('pending_requests') || '[]');
        const key = `${data.participant_id}_${data.stimulus_id}_${data.type}`;
        const exists = pending.some(p =>
            `${p.participant_id}_${p.stimulus_id}_${p.type}` === key
        );
        if (!exists) {
            pending.push(data);
            localStorage.setItem('pending_requests', JSON.stringify(pending));
        }
    },

    _retryPending() {
        const pending = JSON.parse(localStorage.getItem('pending_requests') || '[]');
        if (pending.length === 0) return;

        const remaining = [];
        for (const data of pending) {
            try {
                const blob = new Blob([JSON.stringify(data)], { type: 'text/plain' });
                const queued = navigator.sendBeacon(this.endpoint, blob);
                if (queued) {
                    this._markSent(data);
                } else {
                    remaining.push(data);
                }
            } catch (e) {
                remaining.push(data);
            }
        }
        localStorage.setItem('pending_requests', JSON.stringify(remaining));
    },

    getAllLocal(participantId) {
        const results = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(`response_${participantId}`)) {
                results.push(JSON.parse(localStorage.getItem(key)));
            }
        }
        return results;
    }
};
