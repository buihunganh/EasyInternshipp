
    // Live Binding for real-time preview simulation
    const fullnameInput = document.getElementById('input-fullname');
    const previewName = document.getElementById('preview-name');
    if (fullnameInput && previewName) {
      fullnameInput.addEventListener('input', (e) => {
        previewName.textContent = e.target.value.toUpperCase() || 'HỌ VÀ TÊN';
      });
    }

    const titleInput = document.getElementById('input-title');
    const previewTarget = document.getElementById('preview-target');
    if (titleInput && previewTarget) {
      titleInput.addEventListener('input', (e) => {
        previewTarget.textContent = e.target.value || 'Vị trí ứng tuyển';
      });
    }

    const summaryInput = document.getElementById('input-summary');
    const previewSummary = document.getElementById('preview-summary');
    if (summaryInput && previewSummary) {
      summaryInput.addEventListener('input', (e) => {
        previewSummary.textContent = e.target.value;
      });
    }

    // AI summary generation button interaction
    const aiBtn = document.getElementById('ai-summary-btn');
    if (aiBtn && summaryInput && previewSummary) {
      aiBtn.addEventListener('click', () => {
        aiBtn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> Đang tối ưu với AI...';
        setTimeout(() => {
          const aiGeneratedText = "Sinh viên năm cuối ngành Khoa học Máy tính tại ĐH Bách Khoa TP.HCM (GPA 3.65/4.0). Đam mê sâu sắc với phát triển Frontend hiện đại bằng ReactJS/TypeScript và tư duy xây dựng hệ thống tối ưu hiệu năng. Kỹ năng giao tiếp và tiếng Anh lưu loát (TOEIC 850). Sẵn sàng cống hiến toàn thời gian và bứt phá năng lực trong kỳ thực tập doanh nghiệp sắp tới.";
          summaryInput.value = aiGeneratedText;
          previewSummary.textContent = aiGeneratedText;
          aiBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Đã làm mới!';
          setTimeout(() => {
            aiBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">auto_awesome</span> Gợi ý viết bằng AI';
          }, 2000);
        }, 700);
      });
    }
  