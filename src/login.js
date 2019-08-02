const puppeteer = require('puppeteer');
const commonSetup = require('./utils/commonSetup');
const AutomationError = require('./utils/AutomationError')

const login = async function (server='http://localhost:3000', user='liveness', password='1iveness!', chromePath=process.env.CHROME, logger){
  logger = logger || console
  commonSetup.run();

  const args = ['--no-sandbox', '--disable-setuid-sandbox']
  const options = {ignoreHTTPSErrors: true, args}
  if (chromePath) {
    options.executablePath = chromePath
  }
  const browser = await puppeteer.launch(options)
  const page = await browser.newPage()

  // make sure we're at a width with which we can see the sidepanel if logged in
  await page.setViewport({ width: 1440, height: 748 })

  try{
    await page.goto(server, {timeout: 10000})
  } catch(e) {
    logger.error(`Liveness check on ${server}: Server not reached`)
    throw new AutomationError('server-not-reached', {server, previous: e})
  }

  await page.waitForSelector('input#emailOrUsername')
  await page.type('input#emailOrUsername', user)
  await page.type('input#pass', password)

  await page.click('button.login')
  try {
    await page.waitForSelector('#toast-container', {timeout: 3000})
    logger.error(`Liveness check on ${server}: Toast container appeared after login try`)
    throw new AutomationError('user-not-found', {user, previous: e})
  } catch (e) {
    try{
      await page.waitForSelector('.avatar', { timeout: 30000 })
    }
    catch (e) {
      logger.error(`Liveness check on ${server}: Login failed`)
      await page.screenshot({ path: `${ commonSetup.SCREENSHOTS_DIR_PATH }/login-failed.png` });
      await browser.close()
      throw new AutomationError('login-failed', {previous: e})
    }
    // we didn't get an error, everything as expected
    try {
      await page.goto(`${server}/direct/${user}`)
      await page.waitForSelector('.js-input-message')
      const start = new Date()
      await page.type('.js-input-message', +start + '\n')
      await page.waitForFunction(() => document.querySelectorAll('.message.temp').length === 0)
      await page.keyboard.press('ArrowUp')
      await page.evaluate(() => document.querySelector('.js-input-message').value = '')
      logger.info({server, time: new Date() - start})
      await page.type('.js-input-message', (new Date() - start) + 'ms\n')
      await page.waitFor(1000)
      await page.type('.js-input-message', 'waiting...')
      await page.waitFor(3000)
      await page.evaluate(() => document.querySelector('.js-input-message').value = '')

      // bring up user menue
      await page.click('.avatar')

      // and log out
      await page.waitForSelector('.rc-popover--sidebar-header .rc-popover__column ul:last-of-type li:last-of-type')
      await page.click('.rc-popover--sidebar-header .rc-popover__column ul:last-of-type li:last-of-type')

      // Check we're back to login screen
      await page.waitForSelector('input#emailOrUsername')

      logger.debug(`Liveness check on ${server}: Completed login and logout successfully`)
    } catch (e) {
      logger.info(`Liveness check on ${server}: Generating sreenshot`)
      await page.screenshot({path: `${commonSetup.SCREENSHOTS_DIR_PATH}/login-failed.png`});
    }
  }
  await browser.close()

  return true;
};

module.exports = login
