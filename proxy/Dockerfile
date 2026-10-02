ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:stable-alpine
FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
