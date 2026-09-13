
  // Toggle Password Visibility
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  const eyeIcon = document.getElementById('eye-icon');

  if (toggleBtn && passwordInput && eyeIcon) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.textContent = isPassword ? 'visibility_off' : 'visibility';
    });
  }

  // Segmented Role Switcher Micro-interaction
  const roleButtons = document.querySelectorAll('.role-btn');
  const emailLabel = document.getElementById('email-label');
  const emailInput = document.getElementById('email');

  const rolePlaceholders = {
    candidate: {
      label: 'Email sinh viên / Email liên hệ',
      placeholder: 'minhthu@hcmut.edu.vn hoặc email cá nhân'
    },
    recruiter: {
      label: 'Email công việc / Doanh nghiệp',
      placeholder: 'hr@vinagame.com hoặc hr@company.vn'
    },
    university: {
      label: 'Email quản trị trường đại học',
      placeholder: 'career-center@edu.vn'
    }
  };

  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Deactivate all
      roleButtons.forEach(b => {
        b.classList.remove('bg-surface-container-lowest', 'text-primary', 'shadow-sm');
        b.classList.add('text-on-surface-variant');
        b.setAttribute('aria-selected', 'false');
      });

      // Activate clicked
      btn.classList.add('bg-surface-container-lowest', 'text-primary', 'shadow-sm');
      btn.classList.remove('text-on-surface-variant');
      btn.setAttribute('aria-selected', 'true');

      // Update input labels based on role
      const role = btn.getAttribute('data-role');
      if (role && rolePlaceholders[role] && emailLabel && emailInput) {
        emailLabel.textContent = rolePlaceholders[role].label;
        emailInput.placeholder = rolePlaceholders[role].placeholder;
      }
    });
  });
