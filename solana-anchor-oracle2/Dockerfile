FROM projectserum/build:v0.26.0
WORKDIR /workspace
COPY . .
RUN anchor --version && yarn --version && rustc --version
RUN anchor build
