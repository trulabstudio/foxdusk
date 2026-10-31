// Shared by the homepage and the work page. All content lives in projects.json.
window.foxduskProjects = (() => {
  'use strict';

  const MIN_FOR_WORK_PAGE = 3;
  const MAX_FEATURED = 4;

  async function load() {
    try {
      const response = await fetch('projects.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(response.status);
      const data = await response.json();
      return { clients: data.clients || [], projects: data.projects || [] };
    } catch {
      return { clients: [], projects: [] };
    }
  }

  // A project only appears once it has everything a visitor needs. "result" is optional.
  const isComplete = (project) => Boolean(project.client && project.type && project.problem && project.built && project.image);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function card(project, withDetails) {
    const article = element('article', 'project-card');

    const frame = element('div', 'project-image');
    const image = document.createElement('img');
    image.src = project.image;
    image.alt = `${project.client}: ${project.type}`;
    image.loading = 'lazy';
    frame.append(image);

    const body = element('div', 'project-body');
    body.append(element('span', 'project-type', project.type), element('h3', '', project.client), element('p', 'project-built', project.built));

    if (withDetails) {
      const details = document.createElement('details');
      details.append(element('summary', '', 'View details'));
      const rows = [['The problem', project.problem], ['What we built', project.built], ['The result', project.result]];
      for (const [label, value] of rows) {
        if (!value) continue;
        details.append(element('h4', '', label), element('p', '', value));
      }
      body.append(details);
    }

    article.append(frame, body);
    return article;
  }

  return { load, isComplete, card, MIN_FOR_WORK_PAGE, MAX_FEATURED };
})();
