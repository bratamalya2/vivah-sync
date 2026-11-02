import IntroCurtain from './IntroCurtain'

const INTRO_KEY = 'vs:intro-seen'

// Runs inline while the HTML is still parsing — before first paint — so a
// visitor who has already seen the intro this session never gets a flash of it.
// Blocked storage counts as "seen": without memory we can't promise "once".
const GATE = `(function(){var e=document.getElementById('lp-intro');if(!e)return;var s=1;try{s=sessionStorage.getItem(${JSON.stringify(INTRO_KEY)})==='1'}catch(_){}e.setAttribute(s?'data-skip':'data-intro','')})()`

/** Landing-page loading screen, shown once per browser session. */
export default function LandingIntro() {
  return (
    <>
      <IntroCurtain storageKey={INTRO_KEY} />
      <script dangerouslySetInnerHTML={{ __html: GATE }} />
    </>
  )
}
