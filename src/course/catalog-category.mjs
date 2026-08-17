export function categoryForCatalogCourse(course) {
  const title = String(course?.title || "").toLowerCase();
  if (/security|secure|cryptograph|privacy|intrusion/.test(title)) {
    return "security";
  }
  if (/web services|service oriented/.test(title)) return "services";
  if (/cloud/.test(title)) return "cloud";
  if (
    /data analytics|big data|data mining|data science|information retrieval/.test(
      title,
    )
  ) {
    return "analytics";
  }
  if (
    /database|data cleaning|data management|graph database|nosql|newsql/.test(
      title,
    )
  ) {
    return "data";
  }
  if (/computer vision|image understanding/.test(title)) return "vision";
  if (/robot/.test(title)) return "robotics";
  if (
    /artificial intelligence|machine learning|neural|intelligent|cognitive/.test(
      title,
    )
  ) {
    return "ai";
  }
  if (
    /graphics|global illumination|animation|visualization|virtual reality|computational geometry|perception/.test(
      title,
    )
  ) {
    return "graphics";
  }
  if (/computer network|data communications|network/.test(title)) {
    return "networks";
  }
  if (/parallel/.test(title)) return "parallel";
  if (/distributed/.test(title)) return "distributed";
  if (
    /operating system|architecture|systems programming|computer system|seminar in systems|topics in systems/.test(
      title,
    )
  ) {
    return "systems";
  }
  if (/compiler/.test(title)) return "compiler";
  if (/object-oriented/.test(title)) return "oop";
  if (
    /programming|language|software development tools|languages and tools/.test(
      title,
    )
  ) {
    return "programming";
  }
  if (/algorithm|theory|complexity|puzzle|computability|xtreme/.test(title)) {
    return "theory";
  }
  if (
    /professional|research|thesis|project|co-op|seminar|independent study|proposal|historical|perspective|topics in computer science/.test(
      title,
    )
  ) {
    return "professional";
  }
  return "programming";
}
