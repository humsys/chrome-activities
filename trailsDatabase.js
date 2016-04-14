import Dexie from 'dexie'
import Usage from './usage'

let db = new Dexie("ChromeActivities")

let MINUTES = 60*1000
let DAYS = 24*60*MINUTES
let WEEKS = 7*DAYS
let IGNORE_USAGES_BELOW_THRESHOLD = 3*1000
let IGNORE_TRAILS_BELOW_THRESHOLD = 10*MINUTES
let TRAILS_SEALED_AFTER = 1*DAYS

let activeTrails = {} // blameUrl: {ctime, mtime}

db.version(1).stores({ trails: "ctime,unmarked,total" })
// var exampleTrail = {
//   blameUrl:
//   ctime:
//   mtime:
//   unmarked:
//   total:
//   steps: [[t0,t1,activityId,url,title]]
// }




export default {

  trackUsageTrails(){
    this.initActiveTrailsList()
    Usage.onNewUsage(this.postUsage)
  },

  onTrailChanged(cb){
    Usage.onBlameChanged(blame => {
      if (activeTrails[blame]){
        let ctime = activeTrails[blame].ctime
        db.trails.get(ctime).then(cb)
      }
    })
  },

  mostSignificantTrails(max_age){
    if (!max_age) max_age = 4*WEEKS
    let now = Date.now()

    this.pruneOldAndTinyTrails()

    return db.trails.orderBy('unmarked').reverse().limit(100).and(x => {
      return x.blameUrl && now - x.mtime < max_age
    }).toArray().catch(err => console.log('top trail error', err))
  },

  markTrailSteps(trailId, whichSteps, mark){
    db.trails.where(":id").equals(trailId).modify(trail => {
      let elapsed = 0
      trail.steps.each(s => {
        if (whichSteps.find(ws => ws[0] == s[0])){
          s[2] = mark
          elapsed += s[1] - s[0]
        }
      })
      trail.unmarked -= elapsed
    })
  },


  // PRIVATE

  initActiveTrailsList(){
    let four_days_ago = Date.now() - 4*DAYS
    db.trails.where('ctime').above(four_days_ago).each(t => {
      if (t.mtime > Date.now() - TRAILS_SEALED_AFTER){
        activeTrails[t.blameUrl] = { mtime: t.mtime, ctime: t.ctime }
      }
    })
  },

  pruneOldAndTinyTrails(){
    let now = Date.now()
    db.trails.where('total').below(IGNORE_TRAILS_BELOW_THRESHOLD).and(x => {
      return now - x.mtime > TRAILS_SEALED_AFTER
    }).delete()
  },

  postUsage(blameUrl, url, title, elapsed, favIconUrl){
    if (elapsed < IGNORE_USAGES_BELOW_THRESHOLD) return
    if (!blameUrl) return

    let now = Date.now(), t0 = now-elapsed
    let active = (
      activeTrails[blameUrl] &&
      TRAILS_SEALED_AFTER > (now - activeTrails[blameUrl].mtime)
    )

    if (!active){
      console.log('new trail', blameUrl, url, title, elapsed, favIconUrl)
      activeTrails[blameUrl] = { mtime: now, ctime: now }
      db.trails.put({
        blameUrl: blameUrl,
        ctime: now,
        mtime: now,
        unmarked: elapsed,
        total: elapsed,
        favIconUrl: favIconUrl,
        steps: [ [t0,now,null,url,title] ]
      })

    } else {
      console.log('trail continued', blameUrl, url, title, elapsed, favIconUrl)
      activeTrails[blameUrl].mtime = now
      let ctime = activeTrails[blameUrl].ctime
      db.trails.where(":id").equals(ctime).modify(trail => {
        trail.total += elapsed
        trail.unmarked += elapsed
        trail.mtime = now
        trail.steps.push([t0,now,null,url,title])
      })
    }
  }

}


// // NOT CURRENTLY USED
// function cleanURL(url){
//   if (url && !url.match(/^https?\:\/\//)) return
//   if (!(url = url || currentURL)) return
//   var m = url.match(/:\/\/(.[^/]+)/)
//   return m ? (m[1]).replace('www.','') : url
// }
