module.exports = {
  reactStrictMode: true,
  async redirects() {
    // Edge-level redirect with a real Location header. The old app/page.jsx
    // server redirect() prerendered as a 307 with NO Location — browsers
    // recovered via the RSC payload but curl/uptime checks/link unfurlers got
    // a dead __next_error__ shell.
    return [
      { source: '/', destination: '/personalised-report', permanent: false },
    ];
  },
};
