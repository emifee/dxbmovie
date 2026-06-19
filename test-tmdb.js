const apiKey = process.env.TMDB_API_KEY;
fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent("lioness")}&include_adult=false`)
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data.results[0], null, 2)));
