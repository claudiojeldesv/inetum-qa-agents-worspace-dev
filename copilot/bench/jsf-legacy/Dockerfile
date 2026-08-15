# Banco de la era Java 5: Apache MyFaces 1.1 + Tomahawk 1.1.14 sobre Tomcat 7.
#
# POR QUÉ ESTE BANCO EXISTE. La generación JSF 1.x está extinta en la web pública
# — medido: example.irian.at (los ejemplos de MyFaces que aguantaron una década),
# OpenFaces, el livedemo de RichFaces y ButterFaces ya no resuelven el dominio, e
# ICEfaces no responde. Lo único vivo de la familia es JSF 2.x moderno, que tiene
# AJAX, cambia de URL y trae ARIA: justo lo contrario de lo que hay que probar.
#
# Y no vale escribir el HTML a mano. La lección de K0.21 fue cara: un fixture que
# no reproduce la estructura real da un verde que MIENTE. Aquí el DOM lo produce
# el renderer de MyFaces 1.1 de verdad, con su `javax.faces.ViewState`, sus ids
# generados, su maquetación con tablas y su navegación por POST.
#
# El WAR son los ejemplos oficiales de Apache (`myfaces-example-simple`), tal cual
# se publicaron: no hay nada nuestro dentro, así que no podemos sesgarlo.
#
# Construir y arrancar:
#   docker build -t ia4d/jsf-legacy copilot/bench/jsf-legacy
#   docker run --rm -p 8080:8080 --name jsf-legacy ia4d/jsf-legacy
#   → http://localhost:8080/jsf/   (ya permitido por el patrón http://localhost:*)

FROM eclipse-temurin:8-jre

ENV CATALINA_HOME=/opt/tomcat
ENV PATH=$CATALINA_HOME/bin:$PATH

# Tomcat 7.0.109 (última de la rama 7). El archivo de Apache la sigue sirviendo.
ADD https://archive.apache.org/dist/tomcat/tomcat-7/v7.0.109/bin/apache-tomcat-7.0.109.tar.gz /tmp/tomcat.tar.gz
RUN mkdir -p "$CATALINA_HOME" \
 && tar xzf /tmp/tomcat.tar.gz -C "$CATALINA_HOME" --strip-components=1 \
 && rm -f /tmp/tomcat.tar.gz \
 && rm -rf "$CATALINA_HOME"/webapps/* \
 && chmod +x "$CATALINA_HOME"/bin/*.sh

# Los ejemplos de MyFaces/Tomahawk 1.1.14 (JSF 1.1, la era de Java 5), sin tocar.
ADD https://repo1.maven.org/maven2/org/apache/myfaces/tomahawk/myfaces-example-simple/1.1.14/myfaces-example-simple-1.1.14.war $CATALINA_HOME/webapps/jsf.war
RUN chmod 644 "$CATALINA_HOME"/webapps/jsf.war

EXPOSE 8080
CMD ["catalina.sh", "run"]
