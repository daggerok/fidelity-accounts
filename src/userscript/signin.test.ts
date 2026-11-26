/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, expect, test } from 'bun:test';

beforeAll(() => GlobalRegistrator.register({ url: 'https://digital.fidelity.com/prgw/digital/login/full-page' }));
afterAll(() => GlobalRegistrator.unregister());

const LOGIN = { user: 'someone', pass: 'secret' };

test('two-step sign-in: user first, then the password; one-time code stops it', async () => {
  const { signinStep } = await import('./signin');
  const ALL = { user: true, pass: true };
  const clicks: string[] = [];
  document.body.innerHTML = '<form><input id="login-form_username" autocomplete="username"><button type="button" id="next">Next</button></form>';
  document.getElementById('next')!.addEventListener('click', () => clicks.push('next'));
  let typed = '';
  document.getElementById('login-form_username')!.addEventListener('input', (e) => { typed = (e.target as HTMLInputElement).value; });
  expect(signinStep(document, LOGIN, ALL)).toBe('filled-user');
  expect(typed).toBe('someone');
  expect(clicks).toEqual(['next']);
  // not allowed now (a recent attempt): nothing is typed
  document.body.innerHTML = '<input id="u" autocomplete="username"><button>Next</button>';
  expect(signinStep(document, LOGIN, { user: false, pass: false })).toBe('too-soon');
  expect((document.getElementById('u') as HTMLInputElement).value).toBe('');

  // the password page of the same flow (the user name was typed on the page before)
  document.body.innerHTML = '<input type="password" id="pw"><button type="submit" id="go">Sign In</button>';
  document.getElementById('go')!.addEventListener('click', () => clicks.push('sign in'));
  expect(signinStep(document, LOGIN, { ...ALL, flow: true })).toBe('filled-pass');
  expect((document.getElementById('pw') as HTMLInputElement).value).toBe('secret');
  expect(clicks).toEqual(['next', 'sign in']);

  document.body.innerHTML = '<input autocomplete="one-time-code" id="otp"><button>Verify</button>';
  expect(signinStep(document, LOGIN, ALL)).toBe('mfa');
  expect((document.getElementById('otp') as HTMLInputElement).value).toBe('');
});

test('the Fidelity login form: both fields on one page, "Log In"', async () => {
  const { signinStep } = await import('./signin');
  const clicks: string[] = [];
  document.body.innerHTML = '<input id="dom-username-input" type="text"><input id="dom-pswd-input" type="password"><button id="dom-login-button" type="submit">Log In</button>';
  document.getElementById('dom-login-button')!.addEventListener('click', () => clicks.push('log in'));
  expect(signinStep(document, LOGIN, { user: true, pass: true })).toBe('filled-pass');
  expect((document.getElementById('dom-username-input') as HTMLInputElement).value).toBe('someone');
  expect((document.getElementById('dom-pswd-input') as HTMLInputElement).value).toBe('secret');
  expect(clicks).toEqual(['log in']);
  document.body.innerHTML = '<input id="dom-otp-code-input" type="text"><button>Submit</button>';
  expect(signinStep(document, LOGIN, { user: true, pass: true })).toBe('mfa');
});

test('only the shape of a login form gets the password: never a change-password or reset form', async () => {
  const { signinStep, loginShaped } = await import('./signin');
  const ALL = { user: true, pass: true };
  const clicks: string[] = [];
  const untouched = () => Array.from(document.querySelectorAll('input')).every((i) => i.value === '');
  // a made-up change-password form under the login path: current, new and confirm, no user name field
  document.body.innerHTML = '<form><input type="password" id="cur" autocomplete="current-password"><input type="password" id="new" autocomplete="new-password"><input type="password" id="again" autocomplete="new-password"><button type="submit" id="go">Continue</button></form>';
  document.getElementById('go')!.addEventListener('click', () => clicks.push('continue'));
  expect(signinStep(document, LOGIN, { ...ALL, flow: true })).toBe('not-login');
  expect(untouched()).toBe(true);
  // the same with a user name field on it: still two password fields
  document.body.innerHTML = '<input id="dom-username-input" type="text"><input type="password" id="new"><input type="password" id="again"><button id="go" type="submit">Submit</button>';
  document.getElementById('go')!.addEventListener('click', () => clicks.push('submit'));
  expect(signinStep(document, LOGIN, ALL)).toBe('not-login');
  expect(untouched()).toBe(true);
  // a reset form with one new-password field and no user name, outside a flow that typed the user name
  document.body.innerHTML = '<input type="password" id="new" autocomplete="new-password"><button id="go">Submit</button>';
  document.getElementById('go')!.addEventListener('click', () => clicks.push('submit'));
  expect(signinStep(document, LOGIN, ALL)).toBe('not-login');
  expect(untouched()).toBe(true);
  expect(clicks).toEqual([]);
  // a hidden second password field (display: none) is not counted: the login form still gets it
  document.body.innerHTML = '<input id="dom-username-input" type="text"><input id="dom-pswd-input" type="password"><div style="display:none"><input type="password" id="spare"></div><button type="submit">Log In</button>';
  expect(signinStep(document, LOGIN, ALL)).toBe('filled-pass');
  expect(loginShaped({ passwords: 1, userShown: true, flow: false })).toBe(true);
  expect(loginShaped({ passwords: 1, userShown: false, flow: true })).toBe(true);
  expect(loginShaped({ passwords: 1, userShown: false, flow: false })).toBe(false);
  expect(loginShaped({ passwords: 0, userShown: true, flow: true })).toBe(false);
  expect(loginShaped({ passwords: 2, userShown: true, flow: true })).toBe(false);
  expect(loginShaped({ passwords: 3, userShown: false, flow: false })).toBe(false);
});

test('the script panel on the login page (closed shadow root) is not a second password field', async () => {
  const { signinStep } = await import('./signin');
  const { mountBadge } = await import('./badge');
  document.body.innerHTML = '<input id="dom-username-input" type="text"><input id="dom-pswd-input" type="password"><button type="submit">Log In</button>';
  // the 🔑 form open on the panel: with an open root its password field would be a second one on the page
  const attach = Element.prototype.attachShadow;
  let panel: ShadowRoot | null = null;
  Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) { panel = attach.call(this, init); return panel; };
  mountBadge('9.9.9', () => {}, { saved: () => null, save: () => {}, forget: () => {}, auto: () => true, setAuto: () => {} });
  Element.prototype.attachShadow = attach;
  (panel!.querySelector('[data-m="login"]') as HTMLElement).click();
  expect((panel!.querySelector('.lg') as HTMLElement).hidden).toBe(false);
  expect(signinStep(document, LOGIN, { user: true, pass: true })).toBe('filled-pass');
  expect((document.getElementById('dom-pswd-input') as HTMLInputElement).value).toBe('secret');
});

test('fields inside an open shadow root (web components)', async () => {
  const { findFields } = await import('./signin');
  document.body.innerHTML = '<sdf-input id="host"></sdf-input>';
  const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
  root.innerHTML = '<input type="email" id="inner">';
  expect(findFields(document).user?.id).toBe('inner');
});

test('planSignin: one user step per 30 min, one password per flow', async () => {
  const { planSignin, inFlow, ATTEMPT_GAP_MS } = await import('./signin');
  const T = 10 * ATTEMPT_GAP_MS;
  // nothing yet: a flow may start, a one-page form may send its password
  expect(planSignin({ flowAt: 0, passAt: 0 }, T)).toEqual({ user: true, pass: true });
  // user typed 10 s ago, no password yet: the password page of this flow may send it once
  expect(planSignin({ flowAt: T - 10_000, passAt: 0 }, T)).toEqual({ user: false, pass: true });
  // the password of this flow was sent (wrong password, the page came back): nothing more for 30 min
  expect(planSignin({ flowAt: T - 20_000, passAt: T - 10_000 }, T)).toEqual({ user: false, pass: false });
  expect(planSignin({ flowAt: T - 20_000, passAt: T - 10_000 }, T + ATTEMPT_GAP_MS)).toEqual({ user: true, pass: true });
  // in a flow: the user name typed less than 2 minutes ago, no password sent yet
  expect(inFlow({ flowAt: T - 10_000, passAt: 0 }, T)).toBe(true);
  expect(inFlow({ flowAt: T - 3 * 60_000, passAt: 0 }, T)).toBe(false);
  expect(inFlow({ flowAt: T - 20_000, passAt: T - 10_000 }, T)).toBe(false);
  expect(inFlow({ flowAt: 0, passAt: 0 }, T)).toBe(false);
});

test('a form shown again after our password is a refused password; only the Fidelity login page is used', async () => {
  const { passwordRefused, isLoginPage } = await import('./signin');
  const now = 10_000_000;
  document.body.innerHTML = '<input id="u" autocomplete="username"><input type="password" id="p"><button>Sign In</button>';
  // this flow sent its password a minute ago and the form is back: refused
  expect(passwordRefused(document, { flowAt: now - 120_000, passAt: now - 60_000 }, now)).toBe(true);
  // the password step of a fresh flow (no password sent yet): not refused
  expect(passwordRefused(document, { flowAt: now - 10_000, passAt: 0 }, now)).toBe(false);
  // an old attempt (hours ago) says nothing about this page
  expect(passwordRefused(document, { flowAt: now - 7_200_000, passAt: now - 7_100_000 }, now)).toBe(false);
  // a one-time code page after the password is not a refusal
  document.body.innerHTML = '<input autocomplete="one-time-code">';
  expect(passwordRefused(document, { flowAt: now - 120_000, passAt: now - 60_000 }, now)).toBe(false);
  expect(isLoginPage('/prgw/digital/login/full-page')).toBe(true);
  expect(isLoginPage('/ftgw/digital/portfolio/positions')).toBe(false);
  expect(isLoginPage('')).toBe(false);
});
