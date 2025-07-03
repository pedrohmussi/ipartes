// Elementos DOM
document.addEventListener('DOMContentLoaded', function() {
    const productInput = document.getElementById('product-input');
    const generateBtn = document.getElementById('generate-btn');
    const emailOutput = document.getElementById('email-output');
    const suppliersOutput = document.getElementById('suppliers-output');
    const copyEmailBtn = document.getElementById('copy-email-btn');
    const copySuppliersBtn = document.getElementById('copy-suppliers-btn');
    const loadingSuppliers = document.getElementById('loading-suppliers');

    // Função para gerar o email de cotação
    async function generateEmail() {
        if (!productInput.value.trim()) {
            showNotification('Por favor, insira os detalhes do produto.', 'error');
            return;
        }

        emailOutput.innerHTML = '<div class="spinner"></div> Gerando email...';

        try {
            const response = await fetch('/api/generate-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    productInput: productInput.value
                })
            });

            const data = await response.json();
            
            if (data.email) {
                emailOutput.innerHTML = data.email.replace(/\n/g, '<br>');
                
                // Após gerar o email, buscar fornecedores automaticamente
                findSuppliers();
            } else {
                emailOutput.innerHTML = 'Erro ao gerar o email. Por favor, tente novamente.';
            }
        } catch (error) {
            console.error('Erro:', error);
            emailOutput.innerHTML = 'Erro ao gerar o email. Por favor, tente novamente.';
        }
    }

    // Função para encontrar fornecedores
    async function findSuppliers() {
        if (!productInput.value.trim()) {
            showNotification('Por favor, insira os detalhes do produto.', 'error');
            return;
        }

        suppliersOutput.innerHTML = '<div class="spinner"></div> Buscando fornecedores...';
        loadingSuppliers.style.display = 'flex';

        try {
            console.log('Enviando requisição para buscar fornecedores...');
            const response = await fetch('/api/find-suppliers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    productInput: productInput.value
                })
            });

            console.log('Resposta recebida:', response.status);
            const data = await response.json();
            console.log('Dados recebidos:', data);
            
            if (data.suppliers && Array.isArray(data.suppliers)) {
                // Processar emails normais e registrados
                let emailsHtml = '';
                
                data.suppliers.forEach(email => {
                    // Verificar se o email está na lista de fornecedores registrados
                    const isRegistered = data.registeredSuppliers && 
                                        data.registeredSuppliers.includes(email);
                    
                    if (isRegistered) {
                        // Destacar em negrito os emails registrados
                        emailsHtml += `<strong>${email}</strong><br>`;
                    } else {
                        emailsHtml += `${email}<br>`;
                    }
                });
                
                suppliersOutput.innerHTML = emailsHtml || 'Nenhum email de fornecedor encontrado.';
            } else {
                suppliersOutput.innerHTML = 'Nenhum email de fornecedor encontrado.';
            }
        } catch (error) {
            console.error('Erro ao buscar fornecedores:', error);
            suppliersOutput.innerHTML = 'Erro ao buscar fornecedores. Por favor, tente novamente.';
        } finally {
            loadingSuppliers.style.display = 'none';
        }
    }

    // Função para copiar texto para a área de transferência
    function copyToClipboard(text, successMessage) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification(successMessage);
    }

    // Função para mostrar notificações
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Event Listeners
    generateBtn.addEventListener('click', generateEmail);
    
    copyEmailBtn.addEventListener('click', function() {
        const emailText = emailOutput.innerText;
        if (emailText && !emailText.includes('Gerando email...')) {
            copyToClipboard(emailText, 'Email copiado para a área de transferência!');
        } else {
            showNotification('Nenhum email para copiar.', 'error');
        }
    });
    
    copySuppliersBtn.addEventListener('click', function() {
        const suppliersText = suppliersOutput.innerText;
        if (suppliersText && !suppliersText.includes('Buscando fornecedores...')) {
            copyToClipboard(suppliersText, 'Emails de fornecedores copiados!');
        } else {
            showNotification('Nenhum email de fornecedor para copiar.', 'error');
        }
    });

    // Adicionar botão de cadastro de fornecedor
    const header = document.querySelector('header');
    const cadastroBtn = document.createElement('a');
    cadastroBtn.href = '/cadastro-fornecedor';
    cadastroBtn.className = 'btn cadastro-btn';
    cadastroBtn.innerHTML = '<i class="fas fa-plus"></i> Cadastrar Fornecedor';
    header.appendChild(cadastroBtn);
});
