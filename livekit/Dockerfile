FROM livekit/livekit-server:latest

COPY livekit.yaml /livekit.yaml

EXPOSE 7880 7881

CMD ["livekit-server", "--config", "/livekit.yaml"]
