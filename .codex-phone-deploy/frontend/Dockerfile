FROM support-communication-frontend:sha-knowledgeuploads

USER root
COPY dist/ /usr/share/nginx/html/
RUN chmod -R a+rX /usr/share/nginx/html
USER 101
