namespace ChatServerMVC.services.DTOs.Key
{
    public class GetKeyRequest
    {
        public Guid RoomId { get; set; }
        public Guid PersonalUid { get; set; }
    }
}
