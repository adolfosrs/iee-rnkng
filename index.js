import { job } from 'cron'
import express from 'express'
import http from 'http'
import puppeteer from 'puppeteer'

import { startFirebase, database } from './firebase.js'
import { startObserver } from './observer.js'

const RANKING_URL = 'https://portaldoassociado-iee.com.br/s-info/rl_rankinghome.php'

const PORT = process.env.PORT || 8888
const HOST = process.env.HOST || '0.0.0.0'
const ENV_URL = process.env.ENV_URL || 'http://iee-rnkng-1f1527dcc376.herokuapp.com/'

const app = express()

app.listen(PORT, HOST, async () => {
  console.log('Server started on ' + HOST + ':' + PORT)
  await startFirebase()
  startObserver()
  syncRanking()
})

async function syncRanking() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.goto(RANKING_URL)

  const tableRows = await page.$$eval('body > table > tbody tr', rows => {
    return Array.from(rows, row => {
      const columns = row.querySelectorAll('td')
      return Array.from(columns, column => column.innerText)
    })
  })

  const associates = tableRows.reduce((obj, row) => {
    const position = parseInt(row[0].replace('º', ''))
    const name = row[1]
    const points = parseInt(row[2])

    return {
      ...obj,
      [name]: {
        position,
        points
      }
    }
  }, {})

  console.log('syncRanking:', associates)

  database.ref('hot-rnkng').set(associates)

  await browser.close()
}

//this will prevent the herokuapp to enter sleeping mode.
job(
  '*/10 * * * *',
  () => {
    console.log('Every 10 min task')
    syncRanking()
    http.get(ENV_URL)
  },
  null,
  true
)
