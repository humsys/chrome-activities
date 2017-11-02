import Trails from './trailsDatabase'
import recognizers from './activityRecognizers'
let MINUTES = 60*1000
let IGNORE_ACTIVITIES_BELOW_THRESHOLD = 6*MINUTES


export default {

  trackActivities(){
    Trails.trackUsageTrails()
  },

  onActivityChanged(cb){
    Trails.onTrailChanged(trail => {
      // console.log('got trail', trail)
      cb(this.activitiesForTrail(trail)[0])
    })
  },

  forReview(minimumLength) {
    console.log('asking for top activities')
    return Trails.mostSignificantTrails().then(ary => {
      console.log('got top trails', ary)
      var activities = []
      ary.forEach(x => {
        this.addRecognizedActivities(activities, x, minimumLength)
      })
      return activities.sort( (a,b) => b.elapsed - a.elapsed )
    })
  },

  wasReviewed(a){
    Trails.markTrailSteps(a.trailId, a.steps, a.recognizer)
  },


  // PRIVATE

  activitiesForTrail(t){
    let result = []
    this.addRecognizedActivities(result, t)
    return result.sort( (a,b) => b.elapsed - a.elapsed )
  },

  addRecognizedActivities(ary, trail, minimumLength){
    if (!minimumLength) minimumLength = IGNORE_ACTIVITIES_BELOW_THRESHOLD
    var remainingSteps = [].concat(trail.steps)
    for (var k in recognizers){
      let rec = recognizers[k]
      var subset, desc = ""
      try {
        subset = rec.filter(remainingSteps, trail)
        if (subset && subset.length) desc = rec.describe(subset, trail)
      } catch (e){
        console.log('recognizer failed', k, e)
      }
      remainingSteps = remainingSteps.filter( i => subset.indexOf(i) < 0 )
      var totalElapsed = 0
      subset.forEach(s => totalElapsed += s[1] - s[0])
      if (totalElapsed > minimumLength){
        // activities must have: trailId, whichSteps, elapsed, and id
        ary.push({
          trailId: trail.ctime,
          blame: trail.blameUrl,
          favIconUrl: trail.favIconUrl,
          steps: subset,
          elapsed: totalElapsed,
          over: [subset[0][0], subset[subset.length-1][1]],
          recognizer: k,
          verbPhrase: desc.verbPhrase,
          examples: desc.examples
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
