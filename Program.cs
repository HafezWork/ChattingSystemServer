using Fleck;
using Microsoft.EntityFrameworkCore;
using ChatServerMVC.Models;
using ChatServerMVC.services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

var context = new DataContext(connectionString);
context.Database.EnsureCreated();
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
});
var app = builder.Build();

// Start Fleck WebSocket server on a different port than Kestrel
var wsServer = new WebSocketServer("ws://0.0.0.0:8181");
wsServer.RestartAfterListenError = true;

wsServer.Start(socket =>
{
    WsClient ctx = null;

    socket.OnOpen = () =>
    {
        ctx = new WsClient(socket);
        WebSocketHandler.AddClient(socket, ctx);
    };

    socket.OnClose = () =>
    {
        if (ctx != null)
        {
            //WsClient client;
            //WebSocketHandler.RemoveClient(socket.ConnectionInfo.Id, client);
            Console.WriteLine("Socket closed!");
        }
    };

    socket.OnMessage = message =>
    {
        if (ctx != null)
            WebSocketHandler.Route(ctx, message);
    };
});

// Configure the HTTP request pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();