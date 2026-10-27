/* Nyhetsbrev (för föräldrar). Inget tredjepartsskript.
 *
 * Läser SITE_CONFIG.NEWSLETTER_ENDPOINT (site-config.js).
 *  - Tom eller ogiltig (inte https) => formuläret förblir avstängt och inget skickas någonstans.
 *  - Giltig https-adress => formuläret aktiveras och skickar bara fältet "email" som POST
 *    (application/x-www-form-urlencoded). Tjänsten ska själv skicka bekräftelsemejl (double opt-in).
 */
(function () {
  'use strict';

  var MSG = {
    ok: 'Tack! Kolla din inkorg (och skräpposten). Klicka på länken i mejlet för att bekräfta anmälan.',
    invalid: 'Kontrollera att e-postadressen är rätt skriven.',
    error: 'Något gick fel. Försök igen om en stund.',
    sending: 'Skickar …'
  };

  function validEndpoint(v) {
    if (typeof v !== 'string' || !v) return null;
    try {
      var u = new URL(v);
      return u.protocol === 'https:' ? u.href : null;
    } catch (e) { return null; }
  }

  function init() {
    var box = document.getElementById('newsletter');
    var form = document.getElementById('newsletterForm');
    var input = document.getElementById('newsletterEmail');
    var btn = document.getElementById('newsletterSubmit');
    var status = document.getElementById('newsletterStatus');
    if (!box || !form || !input || !btn) return;

    var cfg = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG) || {};
    var endpoint = validEndpoint(cfg.NEWSLETTER_ENDPOINT);

    function say(kind, text) {
      status.setAttribute('data-kind', kind || '');
      status.textContent = text || '';
    }

    if (!endpoint) {
      // Avstängt läge: skicka aldrig något, även om någon tar bort disabled i webbläsaren.
      box.setAttribute('data-state', 'inactive');
      form.addEventListener('submit', function (e) { e.preventDefault(); });
      return;
    }

    box.setAttribute('data-state', 'active');
    input.disabled = false; input.removeAttribute('aria-disabled');
    btn.disabled = false; btn.removeAttribute('aria-disabled');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      if (!input.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        say('error', MSG.invalid);
        input.focus();
        return;
      }
      btn.disabled = true;
      say('', MSG.sending);
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email=' + encodeURIComponent(email),
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        input.value = '';
        say('ok', MSG.ok);
      }).catch(function () {
        say('error', MSG.error);
      }).then(function () { btn.disabled = false; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
