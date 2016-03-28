import Trails from './trailsDatabase'
import recognizers from './activityRecognizers'
let MINUTES = 60*1000
let IGNORE_ACTIVITIES_BELOW_THRESHOLD = 5*MINUTES


export default {

  monitorActivities(onActivity){
    Trails.monitorTrails(onActivity && (trail => {
      console.log('got trail', trail)
      let topActivity = this.topActivities([trail], 3000)[0]
      console.log('posting top activitie', topActivity)
      onActivity(topActivity)
    }))
  },

  topActivities(trails, minimumLength) {
    if (!trails) trails = Trails.mostSignificantTrails()
    if (!minimumLength) minimumLength = IGNORE_ACTIVITIES_BELOW_THRESHOLD
    var activities = []
    trails.forEach(x => {
      this.addRecognizedActivities(activities, x, minimumLength)
    })
    return activities.sort( (a,b) => b.elapsed - a.elapsed )
  },

  hideActivity(a){
    Trails.markTrailSteps(a.trailId, a.steps, a.recognizer)
  },


  // PRIVATE

  addRecognizedActivities(ary, trail, minimumLength){
    var remainingSteps = [].concat(trail.steps)
    for (var k in recognizers){
      let subset = recognizers[k].filter(trail.steps, trail)
      remainingSteps = remainingSteps.filter( i => subset.indexOf(i) < 0 )
      var totalElapsed = 0
      subset.forEach(s => totalElapsed += s[1] - s[0])
      if (totalElapsed > minimumLength){
        // activities must have: trailId, whichSteps, elapsed, and id
        ary.push({
          trailId: trail.ctime,
          steps: subset,
          elapsed: totalElapsed,
          recognizer: k,
          desc: recognizers[k].describe(subset, trail)
        })
      }
    }
  }

}


// unreviewedActivities(cb){
//   cb([{
//     blame: ['facebook.com'],
//     was: 'viewing profile photos',
//     timespent: 30*60*1000,
//     fromTo: [Date.now()-(1000*60*50), Date.now()-(1000*60)],
//     details: 'Jenny Luscomb'
//   }])
// }
