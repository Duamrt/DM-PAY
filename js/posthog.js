// PostHog — Analytics de produto DM Pay
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="capture identify alias reset set_config startSessionRecording stopSessionRecording".split(" "),i=0;i<o.length;i++)g(u,o[i]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||(window.posthog=[]));

posthog.init('phc_CtiNTixDvDa6Dd5BdyY2EByA3Z6AzUhomCjmEcb2kJ4f', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',
  autocapture: true,
  capture_pageview: true,
  session_recording: { maskAllInputs: true }
});
