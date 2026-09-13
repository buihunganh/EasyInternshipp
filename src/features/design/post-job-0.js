
  // Simple micro-interaction for job title character counter
  const titleInput = document.getElementById('job-title');
  const titleCounter = document.getElementById('title-counter');

  if (titleInput && titleCounter) {
    titleInput.addEventListener('input', (e) => {
      const len = e.target.value.length;
      titleCounter.textContent = `${len} / 100 ký tự`;
      if (len > 100) {
        titleCounter.classList.add('text-error');
      } else {
        titleCounter.classList.remove('text-error');
      }
    });
  }
