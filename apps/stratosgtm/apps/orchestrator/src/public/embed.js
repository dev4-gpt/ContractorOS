(function() {
  // StratosGTM — Universal Embeddable Spoken Voice Agent
  if (window.__StratosGTMEmbedLoaded) return;
  window.__StratosGTMEmbedLoaded = true;

  // Locate current script tag to read parameters
  var currentScript = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var config = {
    company: (currentScript && currentScript.getAttribute('data-company')) || 'StratosGTM',
    clientId: (currentScript && currentScript.getAttribute('data-client-id')) || 'lead_jm_901',
    apiUrl: (currentScript && currentScript.getAttribute('data-api')) || (function() {
      if (currentScript && currentScript.src) {
        var a = document.createElement('a');
        a.href = currentScript.src;
        return a.protocol + '//' + a.host;
      }
      return 'http://localhost:4000';
    })(),
    accent: (currentScript && currentScript.getAttribute('data-accent')) || '#d4af37',
    position: (currentScript && currentScript.getAttribute('data-position')) || 'bottom-right',
    // Optional US state code (e.g. "CA"). When absent the server applies the
    // strictest policy, which is the correct default for an unknown visitor.
    state: (currentScript && currentScript.getAttribute('data-state')) || null
  };

  // Inject Styles
  var style = document.createElement('style');
  style.textContent = `
    .gvos-widget-pill {
      position: fixed;
      ${config.position.includes('left') ? 'left: 24px;' : 'right: 24px;'}
      bottom: 24px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-radius: 9999px;
      background: rgba(18, 18, 20, 0.82);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45), 0 0 24px rgba(212, 175, 55, 0.2);
      color: #f5f5f7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    .gvos-widget-pill:hover {
      transform: translateY(-2px) scale(1.02);
      border-color: rgba(212, 175, 55, 0.4);
      box-shadow: 0 20px 44px rgba(0, 0, 0, 0.55), 0 0 32px rgba(212, 175, 55, 0.35);
    }
    .gvos-pulse-orb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
      position: relative;
    }
    .gvos-pulse-orb::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 2px solid #10b981;
      opacity: 0.6;
      animation: gvos-pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
    }
    @keyframes gvos-pulse {
      0% { transform: scale(0.9); opacity: 0.8; }
      50% { transform: scale(1.6); opacity: 0; }
      100% { transform: scale(0.9); opacity: 0; }
    }
    .gvos-modal {
      position: fixed;
      ${config.position.includes('left') ? 'left: 24px;' : 'right: 24px;'}
      bottom: 84px;
      width: 370px;
      max-width: calc(100vw - 48px);
      height: 520px;
      max-height: calc(100vh - 120px);
      z-index: 999999;
      border-radius: 24px;
      background: rgba(14, 14, 18, 0.94);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(212, 175, 55, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: gvos-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes gvos-fade-in {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .gvos-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
    }
    .gvos-modal-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      text-align: center;
      gap: 16px;
    }
    .gvos-visualizer-box {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(212, 175, 55, 0.22) 0%, rgba(20, 20, 24, 0.8) 70%);
      border: 1px solid rgba(212, 175, 55, 0.35);
      box-shadow: 0 0 35px rgba(212, 175, 55, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .gvos-wave-ring {
      position: absolute;
      inset: -10px;
      border-radius: 50%;
      border: 1px dashed rgba(212, 175, 55, 0.4);
      animation: gvos-spin 12s linear infinite;
    }
    @keyframes gvos-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .gvos-btn {
      padding: 12px 24px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .gvos-btn-primary {
      background: linear-gradient(135deg, #f59e0b 0%, #d4af37 100%);
      color: #000;
      box-shadow: 0 4px 14px rgba(212, 175, 55, 0.35);
    }
    .gvos-btn-primary:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
    .gvos-btn-danger {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }
    .gvos-transcript-card {
      width: 100%;
      min-height: 80px;
      max-height: 120px;
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px;
      font-size: 13px;
      text-align: left;
      line-height: 1.5;
      color: #e2e8f0;
    }
  `;
  document.head.appendChild(style);

  // Create UI Container
  var container = document.createElement('div');
  container.id = 'gvos-widget-root';
  document.body.appendChild(container);

  var isModalOpen = false;
  var isCallActive = false;
  var callStartTime = null;
  // Survives render(), which rebuilds the modal and would otherwise erase an
  // error written straight into the transcript card — leaving a denied mic
  // looking like nothing happened.
  var lastError = null;
  // Distinct from isCallActive: the modal enters "call" state as soon as the
  // button is pressed, but the microphone only opens after policy and consent
  // are settled. The UI must not claim to be listening before it is.
  var micIsLive = false;

  function render() {
    container.innerHTML = '';

    // Floating Pill Trigger
    var pill = document.createElement('div');
    pill.className = 'gvos-widget-pill';
    pill.innerHTML = `
      <div class="gvos-pulse-orb"></div>
      <div>
        <div style="font-size: 11px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.05em;">GrowthOS Voice</div>
        <div style="font-weight: 600; color: #fff;">Talk to Anna</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; opacity: 0.85;">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="22"></line>
      </svg>
    `;
    pill.onclick = function() {
      isModalOpen = !isModalOpen;
      render();
    };
    container.appendChild(pill);

    // Modal
    if (isModalOpen) {
      var modal = document.createElement('div');
      modal.className = 'gvos-modal';
      modal.innerHTML = `
        <div class="gvos-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></div>
            <div style="font-size: 13px; font-weight: 600; color: #fff;">Anna — ${config.company}</div>
          </div>
          <button id="gvos-close-btn" style="background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 18px; line-height: 1;">✕</button>
        </div>
        <div class="gvos-modal-body">
          <div style="font-size: 12px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.06em;">
            ${isCallActive ? 'Session Connected • Spoken AI' : 'Instant 24/7 Strategy Consultation'}
          </div>

          <div class="gvos-visualizer-box">
            <div class="gvos-wave-ring"></div>
            <div style="font-size: 32px;">🎙️</div>
          </div>

          <div style="font-size: 14px; font-weight: 500; color: #f1f5f9; padding: 0 12px;">
            ${!isCallActive
              ? 'Talk to Anna about pricing, roadmap, or book a consultation.'
              : micIsLive
              ? 'Live call — your microphone is on and being transcribed.'
              : 'Your microphone is not on yet.'}
          </div>

          <div class="gvos-transcript-card" id="gvos-transcript">
            ${lastError
              ? `<span style="color: #fca5a5;">${lastError}</span>`
              : `<span style="opacity: 0.6;">Anna: "Hello! Welcome to ${config.company}. I'm Anna, Senior Growth Operating Architect. How can I help maximize your revenue today?"</span>`}
          </div>

          <div>
            ${!isCallActive ? `
              <button class="gvos-btn gvos-btn-primary" id="gvos-start-call">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                Start Spoken Call
              </button>
            ` : `
              <button class="gvos-btn gvos-btn-danger" id="gvos-end-call">
                End Consultation
              </button>
            `}
          </div>

          <div style="font-size: 10px; color: rgba(255,255,255,0.4);">
            Powered by StratosGTM • AssemblyAI Voice Agent
          </div>
        </div>
      `;

      modal.querySelector('#gvos-close-btn').onclick = function() {
        isModalOpen = false;
        render();
      };

      var startBtn = modal.querySelector('#gvos-start-call');
      if (startBtn) {
        startBtn.onclick = function() {
          isCallActive = true;
          callStartTime = Date.now();
          render();
          startSpokenSession();
        };
      }

      var endBtn = modal.querySelector('#gvos-end-call');
      if (endBtn) {
        endBtn.onclick = function() {
          isCallActive = false;
          callStartTime = null;
          stopSpokenSession();
          render();

          // Usage is deliberately not reported from the browser. This handler
          // previously POSTed a hardcoded { leadCaptured: true,
          // estimatedDealValueUsd: 3500 } on every close, so opening and closing
          // the widget invented pipeline revenue. Metering belongs server-side,
          // measured from the session itself, and lands with the usage tables.
        };
      }

      container.appendChild(modal);
    }
  }

  // ==========================================================================
  // Real voice session: mic -> AssemblyAI Voice Agent -> speaker.
  // 24 kHz mono PCM16 both directions, matching the dashboard pipeline.
  // ==========================================================================

  var session = {
    ws: null,
    ctx: null,
    stream: null,
    source: null,
    processor: null,
    scheduledTime: 0,
    playbackSources: []
  };

  function transcriptLine(speaker, text) {
    var el = document.getElementById('gvos-transcript');
    if (!el || !text) return;
    var row = document.createElement('div');
    row.style.marginTop = '6px';
    var who = document.createElement('strong');
    who.textContent = speaker + ': ';
    row.appendChild(who);
    // textContent, not innerHTML: transcripts are untrusted text on a third-party page.
    row.appendChild(document.createTextNode(text));
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
  }

  function setStatusLine(text) {
    var el = document.getElementById('gvos-transcript');
    if (!el) return;
    el.innerHTML = '';
    var row = document.createElement('div');
    row.style.opacity = '0.7';
    row.textContent = text;
    el.appendChild(row);
  }

  function playPcmChunk(base64Pcm) {
    if (!session.ctx) return;
    try {
      var binary = window.atob(base64Pcm);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var int16 = new Int16Array(bytes.buffer);
      var float32 = new Float32Array(int16.length);
      for (var j = 0; j < int16.length; j++) float32[j] = int16[j] / 32768.0;

      var buffer = session.ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      var src = session.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(session.ctx.destination);
      src.onended = function() {
        session.playbackSources = session.playbackSources.filter(function(s) { return s !== src; });
      };
      session.playbackSources.push(src);

      var now = session.ctx.currentTime;
      if (session.scheduledTime < now) session.scheduledTime = now;
      src.start(session.scheduledTime);
      session.scheduledTime += buffer.duration;
    } catch (e) {
      console.error('[StratosGTM] playback error', e);
    }
  }

  function abortPlayback() {
    if (session.ctx) session.scheduledTime = session.ctx.currentTime;
    session.playbackSources.forEach(function(s) {
      try { s.stop(); s.disconnect(); } catch (e) {}
    });
    session.playbackSources = [];
  }

  function stopSpokenSession() {
    micIsLive = false;
    abortPlayback();
    if (session.processor) { try { session.processor.disconnect(); } catch (e) {} session.processor = null; }
    if (session.source) { try { session.source.disconnect(); } catch (e) {} session.source = null; }
    if (session.stream) {
      session.stream.getTracks().forEach(function(t) { t.stop(); });
      session.stream = null;
    }
    if (session.ws) {
      try {
        // session.end, not `Terminate`: the API rejects the latter as an unknown
        // message and the socket drop that follows leaves the session billable and
        // resumable for 30 seconds.
        if (session.ws.readyState === WebSocket.OPEN) session.ws.send(JSON.stringify({ type: 'session.end' }));
        session.ws.close();
      } catch (e) {}
      session.ws = null;
    }
    if (session.ctx) { try { session.ctx.close(); } catch (e) {} session.ctx = null; }
    session.scheduledTime = 0;
  }

  var sessionId = 'gvos_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  var consentGiven = false;

  /**
   * Consent gate. In all-party-consent states a live transcript can count as
   * interception, so the microphone must not open until the visitor agrees.
   * The server decides the policy; the widget only renders and records it.
   */
  function requestConsent(policy, onGranted) {
    var el = document.getElementById('gvos-transcript');
    if (!el) return;
    el.innerHTML = '';

    var notice = document.createElement('div');
    notice.style.marginBottom = '10px';
    notice.style.lineHeight = '1.45';
    notice.textContent = policy.disclosureText;
    el.appendChild(notice);

    var agree = document.createElement('button');
    agree.className = 'gvos-btn gvos-btn-primary';
    agree.style.width = '100%';
    agree.textContent = 'I agree — start the call';
    agree.onclick = function() {
      agree.disabled = true;
      agree.textContent = 'Recording consent...';
      fetch(config.apiUrl + '/api/compliance/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          companyName: config.company,
          state: config.state || null,
          consentGranted: true
        })
      })
        .then(function(r) { return r.json(); })
        .then(function() {
          consentGiven = true;
          onGranted();
        })
        .catch(function(e) {
          console.error('[StratosGTM] consent error', e);
          lastError = 'Could not record consent. Please try again.';
          isCallActive = false;
          render();
        });
    };
    el.appendChild(agree);
  }

  function startSpokenSession() {
    lastError = null;
    setStatusLine('Checking requirements...');

    // Policy first: the disclosure and, where required, consent must precede any
    // microphone access — not follow it.
    fetch(config.apiUrl + '/api/compliance/policy' + (config.state ? '?state=' + encodeURIComponent(config.state) : ''))
      .then(function(r) { return r.json(); })
      .then(function(body) {
        var policy = body.policy;
        if (policy && policy.consentRequirement === 'explicit_opt_in' && !consentGiven) {
          requestConsent(policy, beginTokenExchange);
          return;
        }
        beginTokenExchange();
      })
      .catch(function(e) {
        console.error('[StratosGTM] policy error', e);
        lastError = 'Could not verify call requirements. Please try again.';
        isCallActive = false;
        render();
      });
  }

  // Tool definitions come from the same /api/voice/config the console uses, so the
  // widget and the dashboard register an identical tool set. Without these the agent
  // can talk but cannot create or qualify a lead, which is the point of the widget.
  var cachedTools = null;

  function fetchVoiceTools() {
    if (cachedTools) return Promise.resolve(cachedTools);
    return fetch(config.apiUrl + '/api/voice/config')
      .then(function(res) { return res.ok ? res.json() : null; })
      .then(function(cfg) {
        cachedTools = (cfg && cfg.tools) || [];
        return cachedTools;
      })
      .catch(function(e) {
        console.error('[StratosGTM] could not load tool definitions', e);
        return [];
      });
  }

  function beginTokenExchange() {
    setStatusLine('Connecting...');

    // Fetched alongside the token mint rather than after it, so registering tools
    // costs no extra round trip before the microphone prompt.
    var toolsPromise = fetchVoiceTools();

    fetch(config.apiUrl + '/api/voice/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: config.company })
    })
      .then(function(res) {
        return res.json().then(function(body) { return { ok: res.ok, body: body }; });
      })
      .then(function(r) {
        if (!r.ok || !r.body.token) {
          if (r.body && r.body.code === 'VOICE_UNCONFIGURED') {
            lastError = 'Voice is not configured on this site yet.';
          } else if (r.body && r.body.code === 'RATE_LIMITED') {
            lastError = 'Too many calls from this network right now. Please try again shortly.';
          } else {
            lastError = 'Could not start the call. Please try again.';
          }
          isCallActive = false;
          render();
          return;
        }
        return toolsPromise.then(function(tools) {
          return openSocket(r.body.token, (r.body.compliance && r.body.compliance.disclosureText) || '', tools);
        });
      })
      .catch(function(e) {
        console.error('[StratosGTM] token error', e);
        lastError = 'Could not reach the voice service.';
        isCallActive = false;
        render();
      });
  }

  // The agent is blocked on this call_id until it receives a tool.result, so every
  // path here must send one - including failures. Otherwise the conversation stalls
  // mid-sentence with no way to recover.
  function handleToolCall(msg) {
    function reply(result) {
      var ws = session.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'tool.result',
          call_id: msg.call_id,
          result: JSON.stringify(result)
        }));
      }
    }

    fetch(config.apiUrl + '/api/crm/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: msg.name, arguments: msg.arguments })
    })
      .then(function(res) {
        return res.json().then(function(body) { return { ok: res.ok, body: body }; });
      })
      .then(function(r) {
        if (r.ok) {
          reply(r.body.result !== undefined ? r.body.result : r.body);
        } else {
          reply({ error: (r.body && r.body.error) || 'Tool execution failed' });
        }
      })
      .catch(function(e) {
        console.error('[StratosGTM] tool execution failed', e);
        reply({ error: 'Tool execution failed' });
      });
  }

  function openSocket(token, disclosureText, tools) {
    return navigator.mediaDevices
      .getUserMedia({
        audio: { channelCount: 1, sampleRate: 24000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      .then(function(stream) {
        session.stream = stream;
        session.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        if (session.ctx.state === 'suspended') session.ctx.resume();

        var ws = new WebSocket('wss://agents.assemblyai.com/v1/ws?token=' + token);
        session.ws = ws;

        ws.onopen = function() {
          // Disclosure is spoken first, before any substantive exchange.
          var baseGreeting = 'Hi, this is Anna. What brought you to ' + config.company + ' today?';
          var greeting = disclosureText ? disclosureText + ' ' + baseGreeting : baseGreeting;

          var registeredTools = tools || [];
          if (registeredTools.length === 0) {
            console.warn('[StratosGTM] No tools registered - the agent cannot capture a lead this session.');
          }

          var sessionConfig = {
            system_prompt:
              'You are Anna, a senior growth advisor speaking with a visitor on the ' +
              config.company +
              ' website. Be concise and consultative. Ask one question at a time. ' +
              'If asked whether you are a human or an AI, say plainly that you are an AI. ' +
              'When the visitor gives their name, email, budget or intent, record it with the ' +
              'tools available to you rather than only acknowledging it.',
            greeting: greeting,
            input: { format: { encoding: 'audio/pcm' }, language_code: 'en' },
            output: { voice: 'anna', format: { encoding: 'audio/pcm' } }
          };
          if (registeredTools.length > 0) {
            sessionConfig.tools = registeredTools;
          }

          ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig }));

            session.source = session.ctx.createMediaStreamSource(session.stream);
          session.processor = session.ctx.createScriptProcessor(2048, 1, 1);
          session.processor.onaudioprocess = function(e) {
            if (!isCallActive || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
            var input = e.inputBuffer.getChannelData(0);
            var pcm16 = new Int16Array(input.length);
            for (var i = 0; i < input.length; i++) {
              var s = Math.max(-1, Math.min(1, input[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            var bytes = new Uint8Array(pcm16.buffer);
            var binary = '';
            for (var k = 0; k < bytes.byteLength; k++) binary += String.fromCharCode(bytes[k]);
            session.ws.send(JSON.stringify({ type: 'input.audio', audio: window.btoa(binary) }));
          };
          session.source.connect(session.processor);
          // Zero-gain sink: ScriptProcessor needs a destination connection to run,
          // but routing the mic to the speakers would cause feedback.
          var mute = session.ctx.createGain();
          mute.gain.value = 0;
          session.processor.connect(mute);
          mute.connect(session.ctx.destination);

          micIsLive = true;
          render();
          setStatusLine('Listening...');
        };

        ws.onmessage = function(evt) {
          var msg;
          try { msg = JSON.parse(evt.data); } catch (e) { return; }

          if (msg.type === 'transcript.user' && msg.text) {
            transcriptLine('You', msg.text);
          } else if (msg.type === 'transcript.agent' && msg.text) {
            transcriptLine('Anna', msg.text);
          } else if (msg.type === 'reply.audio' && msg.data) {
            // The Voice Agent API sends the base64 PCM16 chunk on `data`, not `audio`.
            // Guarding on `msg.audio` meant this branch never fired: the widget was silent.
            playPcmChunk(msg.data);
          } else if (msg.type === 'reply.done' && msg.status === 'interrupted') {
            abortPlayback();
          } else if (msg.type === 'tool.call') {
            handleToolCall(msg);
          }
        };

        ws.onerror = function() {
          setStatusLine('Connection error.');
        };

        ws.onclose = function() {
          if (isCallActive) {
            isCallActive = false;
            stopSpokenSession();
            render();
          }
        };
      })
      .catch(function(e) {
        console.error('[StratosGTM] mic error', e);
        lastError =
          e && e.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Allow mic access to talk to Anna.'
            : 'Could not access the microphone.';
        isCallActive = false;
        stopSpokenSession();
        render();
      });
  }

  // Initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
