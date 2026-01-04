using System.Collections.Concurrent;

namespace ChatServerMVC.services.Interfaces
{
    public interface IConnectionRegistry
    {
        void Add(Guid userId, WsClient client);
        void Remove(Guid userId);
        bool TryGet(Guid userId, out WsClient client);
    }

    public class ConnectionRegistry : IConnectionRegistry
    {
        private readonly ConcurrentDictionary<Guid, WsClient> _clients = new();

        public void Add(Guid userId, WsClient client) => _clients[userId] = client;

        public void Remove(Guid userId) => _clients.TryRemove(userId, out _);

        public bool TryGet(Guid userId, out WsClient client) => _clients.TryGetValue(userId, out client!);
    }
}
