
    (function() {
      // Role Switcher Interaction
      const roleBtns = document.querySelectorAll('.role-btn');
      const submitBtn = document.getElementById('submit-btn');
      const roleSubmitLabels = {
        student: 'Tạo tài khoản sinh viên',
        employer: 'Tạo tài khoản Doanh nghiệp',
        university: 'Tạo tài khoản Đại học / Viện'
      };

      roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          roleBtns.forEach(b => {
            b.classList.remove('ring-2', 'ring-primary', 'bg-surface-container-low');
            b.classList.add('bg-surface');
            const check = b.querySelector('.role-check');
            if (check) check.classList.add('hidden');
          });
          btn.classList.add('ring-2', 'ring-primary', 'bg-surface-container-low');
          btn.classList.remove('bg-surface');
          const activeCheck = btn.querySelector('.role-check');
          if (activeCheck) activeCheck.classList.remove('hidden');

          const role = btn.dataset.role;
          if (submitBtn && roleSubmitLabels[role]) {
            submitBtn.querySelector('span:first-child').textContent = roleSubmitLabels[role];
          }
        });
      });

      // Password Toggle Visibility
      const pwInput = document.getElementById('password');
      const togglePw = document.getElementById('toggle-pw');
      if (pwInput && togglePw) {
        togglePw.addEventListener('click', () => {
          const isPw = pwInput.type === 'password';
          pwInput.type = isPw ? 'text' : 'password';
          togglePw.textContent = isPw ? 'visibility_off' : 'visibility';
        });
      }

      // Quick FAQ Accordion Toggle
      const faqToggle = document.getElementById('faq-toggle');
      const faqContent = document.getElementById('faq-content');
      const faqIcon = document.getElementById('faq-icon');
      if (faqToggle && faqContent && faqIcon) {
        faqToggle.addEventListener('click', () => {
          const isHidden = faqContent.classList.contains('hidden');
          if (isHidden) {
            faqContent.classList.remove('hidden');
            faqIcon.textContent = 'expand_less';
          } else {
            faqContent.classList.add('hidden');
            faqIcon.textContent = 'expand_more';
          }
        });
      }
    })();
  