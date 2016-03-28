var url = require('url')


function longest(steps, count){
  steps.sort(
    (a,b) => (b[1]-b[0])-(a[1]-a[0])
  ).slice(0,count)
}


export default {
  indirect: {
    filter(steps, trail){
      let host = url.parse(trail.blameUrl).host
      return steps.filter(s => s[3].indexOf(host) == -1)
    },
    describe(steps, trail){
      let topTitles = longest(steps, 3).map(s => s[4]).join(', ')
      return {
        was: "looking at links off of",
        details: topTitles
      }
    }
  },

  remaining: {
    filter(steps){
      return steps
    },
    describe(steps, trail){
      let topTitles = longest(steps, 3).map(s => s[4]).join(', ')
      return {
        was: "using",
        details: topTitles
      }
    }
  }
}
