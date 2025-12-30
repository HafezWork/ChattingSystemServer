using Fleck;
using Microsoft.EntityFrameworkCore;
using ChatServerMVC.Models;
using ChatServerMVC.services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using ChatServerMVC.services.Interfaces;
using ChatServerMVC.services.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContextFactory<DataContext>(options =>
{
    options.UseMySql(builder.Configuration.GetConnectionString("DefaultConnection"), ServerVersion.AutoDetect(builder.Configuration.GetConnectionString("DefaultConnection")));
});
builder.Services.AddControllers();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IRoomService, RoomService>();
builder.Services.AddScoped<IMessageService, MessageService>();
builder.Services.AddScoped<IKeyService, KeyService>();
builder.Services.AddSingleton<IConnectionRegistry, ConnectionRegistry>();
builder.Services.AddScoped<WebSocketHandler>();


//var context = new DataContext(connectionString);
//context.Database.EnsureCreated();
//builder.Services.AddSingleton<IConnectionRegistry, ConnectionRegistry>();
//builder.Services.AddScoped<ChatHub>();
builder.Services.AddSwaggerGen();


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

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});


var app = builder.Build();

app.UseCors("AllowFrontend");

using (var scope = app.Services.CreateScope())
{
    var wsHandler = scope.ServiceProvider.GetRequiredService<WebSocketHandler>();
    wsHandler.Start();
    var db = scope.ServiceProvider.GetRequiredService<DataContext>();
    try
    {
        if (!db.Database.CanConnect())
        {
            Console.WriteLine("Database connection failed. Exiting.");
            return; // stop the app
        }
        Console.WriteLine("Database connection successful.");


        Console.WriteLine($"Database exists: {db.Database.GetAppliedMigrations().Any()}");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database connection check failed: {ex.Message}");
        throw; // stop the app
    }
}




if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseSwagger();
app.UseSwaggerUI();
app.UseAuthorization();
app.UseWebSockets();


app.MapControllers();
//app.UseSwagger();
//app.UseSwaggerUI();
app.Run();